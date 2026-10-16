import {accountCharacterRows,requestedCharacterIds,characterSyncNeeded} from './account-model.js';
export async function mountAccount({onSnapshot,notify,getState}){
 const root=document.createElement('article');root.className='panel account-sync';
 root.innerHTML='<div class="panel-head"><div><h3>米游社账号同步</h3><p id="accountSyncStatus">正在读取本机同步状态…</p></div><span id="accountSession" class="tag"></span></div><div class="actions"><button id="refreshAccount" class="primary">读取最新账号数据</button><button id="applyAccount">同步到规划</button><a id="verifyAccount" class="tag amber" href="/verify.html" target="_blank" rel="noreferrer" hidden>完成本人验证 ↗</a><label><input id="autoAccount" type="checkbox" checked>页面打开时每 5 分钟更新</label></div><p id="backendCompatibility" class="notice" hidden></p><div id="accountCapabilities" class="material-grid"></div><p id="accountErrors" class="notice" hidden></p><details><summary>已读取角色现状</summary><div class="actions"><label>筛选角色<input id="ownedSearch" placeholder="按名称筛选"></label></div><div id="ownedCharacters" class="material-grid"></div></details><details><summary>已读取养成材料库存</summary><div class="actions"><label>筛选材料<input id="inventorySearch" placeholder="按名称筛选"></label></div><div id="ownedInventory" class="material-grid"></div></details><p class="muted">登录会话仅保存在服务进程内存中，重启后需手动更新会话。只保存游戏数据快照，不关联 KeePassXC。接口未返回的数据标为未知；验证失败时保留旧快照及其原始时间。养成计算器提供的材料只代表本次查询覆盖的范围。</p>';
 document.querySelector('#account .section-title').after(root);
 const login=document.createElement('details');login.innerHTML='<summary>手动更新登录信息（仅本次服务会话）</summary><form id="manualAccountLogin" class="form-grid"><label>米哈游账号<input name="username" autocomplete="username" required maxlength="200"></label><label>密码<input name="password" type="password" autocomplete="off" required maxlength="500"></label><p class="wide muted">只提交至本机服务，再由服务向米游社官方登录。不写入文件或浏览器存储；关闭服务后会话清除。若官方要求验证码，将显示本人验证入口。</p><button type="submit" class="primary">登录并同步</button></form>';root.append(login);
 const $=s=>root.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let snapshot=null,busy=false,catalog=null,selectedKey=null,selectionTimer=null,selectionVersion=0,sessionActive=false;
 try{const response=await fetch('/data/catalog.json');if(response.ok)catalog=await response.json();}catch{}
 function requestedCharacters(){return requestedCharacterIds(getState(),catalog,selectedKey,snapshot);}
 window.addEventListener('planner-state-changed',renderLists);
 function renderLists(){
  const query=$('#ownedSearch').value.trim();const chars=catalog?accountCharacterRows(snapshot,catalog,getState()):snapshot?.characters?.items;
  $('#ownedCharacters').innerHTML=chars?chars.filter(c=>c.name.includes(query)).map(c=>`<article class="material-card"><b>${esc(c.name)} · ${esc(c.element)}</b><p>等级 ${c.level??'未知'} · 突破 ${c.ascension??'未知'} · 命之座 ${c.constellation??'未知'}</p><p>${c.weapon?esc(c.weapon.name)+' · Lv.'+(c.weapon.level??'?')+' · 精炼 '+(c.weapon.refinement??'?'):'武器未知'}</p><p>基础天赋 ${c.talents?.map(v=>v??'未知').join(' / ')??'未知'}</p><p>${c.skills?'接口天赋：'+c.skills.map(s=>esc(s.name)+' '+(s.level??'?')).join(' / '):'此元素或角色的接口天赋尚未读取'}</p><p class="muted">${esc(c.source??'米游社快照')} · ${c.syncedAt?esc(new Date(c.syncedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})):'读取时间未知'}</p><a href="#catalog" data-record-character="${esc(c.key??'')}">查看 / 记录现状</a></article>`).join('')||'<p>没有匹配角色。</p>':'<p>尚未读取角色；不能据此判断账号没有角色。</p>';
  const inv=snapshot?.inventory?.items,term=$('#inventorySearch').value.trim();
  $('#ownedInventory').innerHTML=inv?inv.filter(m=>m.name.includes(term)).map(m=>`<article class="material-card"><b>${esc(m.name)}</b><strong>${m.minimum?'≥ ':''}${m.count.toLocaleString('zh-CN')}</strong></article>`).join('')||'<p>接口未返回匹配材料。</p>':'<p>库存未知，尚未取得可用的养成计算器库存。</p>';
 }
 function display(data){
  snapshot=data.snapshot;sessionActive=data.sessionActive===true;$('#backendCompatibility').hidden=data.schemaRevision===2;$('#backendCompatibility').textContent='当前账号服务仍是旧版解析。需关闭原服务窗口并重新启动 start.cmd，才能启用突破、天赋及圣遗物详情读取修复；登录会话只存内存，重启后请手动登录。已有目标和游戏快照会保留。';
  $('#accountSession').textContent=data.sessionActive?'本机会话已连接':'无活动登录会话';
  $('#applyAccount').disabled=!snapshot;$('#refreshAccount').disabled=!data.sessionActive;
  if(!snapshot){$('#accountSyncStatus').textContent='尚无账号快照。请通过本机登录会话启动同步。';renderLists();return;}
  const role=snapshot.role;$('#accountSyncStatus').textContent=`${role.nickname||'旅行者'} · UID ${role.uid} · ${role.regionName||role.region} · 最近检查 ${new Date(snapshot.checkedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`;
  $('#verifyAccount').hidden=!snapshot.verificationRequired;
  const notes=snapshot.notes,characters=snapshot.characters,inventory=snapshot.inventory;
  $('#accountCapabilities').innerHTML=[['实时资源',notes?`树脂 ${notes.resin??'未知'} / ${notes.maxResin??'未知'}；洞天宝钱 ${notes.homeCoin??'未知'}；剩余周本折扣 ${notes.weeklyDiscountsRemaining??'未知'}`:'尚未读取',notes?.syncedAt],['角色与武器',characters?`${catalog?accountCharacterRows(snapshot,catalog,getState()).length:characters.items.length} 个角色 / 元素记录 · 本次更新 ${characters.items.filter(c=>(c.syncedAt??characters.syncedAt)===characters.syncedAt).length} 名角色，其余保留各自快照`:'尚未读取',characters?.syncedAt],['养成材料库存',inventory?`${inventory.items.length} 种 · ${inventory.coverage}`:'未知，未按零库存处理',inventory?.syncedAt]].map(([title,content,at])=>`<article class="material-card"><b>${title}</b><p>${esc(content)}</p><p>${at?esc(new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})):'无成功读取时间'}</p></article>`).join('');
  const errors=Object.entries(snapshot.errors??{});$('#accountErrors').hidden=!errors.length;$('#accountErrors').textContent=errors.map(([key,e])=>`${key}：${e.code}`).join('；')+(snapshot.inventory&&!snapshot.errors?.inventory?'。库存已独立同步；上述战绩接口仍需本人验证。':snapshot.verificationRequired?'。官方要求本人验证，请点击「完成本人验证」。':'');renderLists();
 }
 async function load(refresh=false,apply=false){
  if(busy)return;busy=true;$('#refreshAccount').disabled=true;
  try{const response=await fetch(refresh?'/api/account/refresh':'/api/account',refresh?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({characterIds:requestedCharacters()})}:{});const data=await response.json();if(!response.ok)throw new Error(data.error);display(data);if(apply&&snapshot)await onSnapshot(snapshot);return data;}catch(e){notify('账号同步未完成：'+e.message);return {error:e.message};}finally{busy=false;$('#refreshAccount').disabled=$('#accountSession').textContent==='无活动登录会话';}
 }
 function selectionStatus(key,status,message){window.dispatchEvent(new CustomEvent('character-sync-state',{detail:{key,status,message}}));}
 async function syncSelection(version,force=false){
  const key=selectedKey;if(!key||version!==selectionVersion)return;
  if(!sessionActive){selectionStatus(key,'error','本机会话未登录，请在账号页面登录后读取。');return;}
  const entry=(catalog?.characters??[]).find(c=>c.key===key),traveler=key.startsWith('traveler');
  if(!traveler&&!snapshot?.characters?.items.some(c=>c.id===entry?.id)){selectionStatus(key,'error','账号快照暂无此角色的持有记录，不能据此填入当前值。');return;}
  if(traveler){const row=accountCharacterRows(snapshot,catalog,getState()).find(c=>c.key===key);if(row?.activeElement===false){selectionStatus(key,'error','游戏当前启用的旅行者元素不同；请切换到此元素后读取，或手动核对天赋。');return;}}
  if(!force&&!characterSyncNeeded(getState(),key)){selectionStatus(key,'success','已带入此角色最近成功读取的等级、突破、基础天赋与配装。');return;}
  if(busy){selectionStatus(key,'waiting','正在完成上一项同步，随后读取此角色…');selectionTimer=setTimeout(()=>syncSelection(version,force),700);return;}
  const started=Date.now();selectionStatus(key,'loading','正在按需读取此角色的等级、突破、三项基础天赋与圣遗物…');
  const data=await load(true,true);if(version!==selectionVersion)return;
  if(data?.error){selectionStatus(key,'error','读取未完成：'+data.error);return;}
  if(!characterSyncNeeded(getState(),key)){selectionStatus(key,'success','此角色现状已同步，目标默认值已更新。');return;}
  const checked=Date.parse(data?.snapshot?.checkedAt);
  if(Number.isFinite(checked)&&checked<started){const delay=Math.max(1000,checked+61500-Date.now());selectionStatus(key,'waiting','接口有刷新间隔，约 '+Math.ceil(delay/1000)+' 秒后自动补读此角色；当前空白仍表示未知。');selectionTimer=setTimeout(()=>syncSelection(version,true),Math.min(62000,delay));return;}
  const errors=data?.snapshot?.errors??{};selectionStatus(key,'error',errors.calculatorCharacters||errors.inventory?'官方详情暂未完整返回，请在账号页查看验证状态后重试。':'接口仍未完整返回此角色当前值，请重试或手动核对。');
 }
 window.addEventListener('request-character-sync',event=>{selectedKey=event.detail?.key??null;selectionVersion++;clearTimeout(selectionTimer);const version=selectionVersion;if(selectedKey)selectionTimer=setTimeout(()=>syncSelection(version,event.detail?.force===true),450);});
 $('#ownedCharacters').onclick=e=>{const a=e.target.closest('[data-record-character]');if(a)window.dispatchEvent(new CustomEvent('select-character-record',{detail:a.dataset.recordCharacter}));};
 $('#refreshAccount').onclick=()=>load(true,true);$('#applyAccount').onclick=()=>{if(snapshot)onSnapshot(snapshot);};$('#ownedSearch').oninput=renderLists;$('#inventorySearch').oninput=renderLists;
 $('#manualAccountLogin').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const form=e.currentTarget;try{const body=JSON.stringify({username:form.elements.username.value,password:form.elements.password.value,characterIds:requestedCharacters()});form.elements.password.value='';const response=await fetch('/api/account/login',{method:'POST',headers:{'Content-Type':'application/json'},body});const data=await response.json();if(!response.ok)throw new Error(data.error);display(data);if(snapshot)await onSnapshot(snapshot);window.dispatchEvent(new Event('account-sync-ready'));notify('官方登录成功，已读取接口当前允许的数据');}catch(error){notify('登录或读取未完成：'+error.message);}finally{busy=false;form.elements.password.value='';}};
 await load(false,true);window.dispatchEvent(new Event('account-sync-ready'));
 setInterval(()=>{if(!$('#autoAccount').checked||document.hidden||snapshot?.verificationRequired&&[snapshot.errors?.inventory,snapshot.errors?.calculatorCharacters].some(e=>[1034,10034,10035,10041].includes(e?.code))||document.activeElement?.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;load(true,true);},300000);
 window.addEventListener('focus',()=>load(false,false));
}

import {accountCharacterRows,requestedCharacterIds,characterSyncNeeded} from './account-model.js';
export async function mountAccount({onSnapshot,notify,getState}){
 const root=document.createElement('article');root.className='panel account-sync';
 root.innerHTML='<div class="panel-head"><div><h3>米游社账号同步</h3><p id="accountSyncStatus">正在读取本机同步状态…</p></div><span id="accountSession" class="tag"></span></div><div class="actions"><button id="refreshAccount" class="primary">读取最新账号数据</button><button id="applyAccount">同步到规划</button><a id="verifyAccount" class="tag amber" href="/verify.html" target="_blank" rel="noreferrer" hidden>完成本人验证 ↗</a><label><input id="autoAccount" type="checkbox">每30分钟自动更新（遇验证暂停）</label></div><p id="requestPolicy" class="muted">默认仅手动联网更新；切换页面、选择角色与切回窗口不会请求官方接口。</p><p id="backendCompatibility" class="notice" hidden></p><div id="accountCapabilities" class="material-grid"></div><p id="accountErrors" class="notice" hidden></p><details><summary>已读取角色现状</summary><div class="actions"><label>筛选角色<input id="ownedSearch" placeholder="按名称筛选"></label></div><div id="ownedCharacters" class="material-grid"></div></details><details><summary>已读取养成材料库存</summary><div class="actions"><label>筛选材料<input id="inventorySearch" placeholder="按名称筛选"></label></div><div id="ownedInventory" class="material-grid"></div></details><p class="muted">登录会话仅保存在服务进程内存中，重启后需手动更新会话。只保存游戏数据快照，不关联 KeePassXC。接口未返回的数据标为未知；验证失败时保留旧快照及其原始时间。养成计算器提供的材料只代表本次查询覆盖的范围。</p>';
 document.querySelector('#account .section-title').after(root);
 const login=document.createElement('details');login.innerHTML='<summary>手动更新登录信息（仅本次服务会话）</summary><form id="manualAccountLogin" class="form-grid"><label>米哈游账号<input name="username" autocomplete="username" required maxlength="200"></label><label>密码<input name="password" type="password" autocomplete="off" required maxlength="500"></label><p class="wide muted">只提交至本机服务，再由服务向米游社官方登录。不写入文件或浏览器存储；关闭服务后会话清除。若官方要求验证码，将显示本人验证入口。</p><button type="submit" class="primary">登录并同步</button></form>';root.append(login);
 const $=s=>root.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let snapshot=null,busy=false,catalog=null,selectedKey=null,selectionTimer=null,selectionVersion=0,sessionActive=false,lastNetworkAttempt=Date.now();
 const autoPreference='teyvat-account-auto-v2';
 try{$('#autoAccount').checked=localStorage.getItem(autoPreference)==='true';}catch{}
 function saveAutoPreference(){try{localStorage.setItem(autoPreference,String($('#autoAccount').checked));}catch{}}
 $('#autoAccount').onchange=()=>{lastNetworkAttempt=Date.now();saveAutoPreference();$('#requestPolicy').textContent=$('#autoAccount').checked?'自动更新已启用：每30分钟最多一次；遇人机验证立即暂停。':'仅手动联网更新；切换页面、选择角色与切回窗口不会请求官方接口。';};
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
  snapshot=data.snapshot;sessionActive=data.sessionActive===true;$('#backendCompatibility').hidden=data.schemaRevision>=3;$('#backendCompatibility').textContent='当前服务仍可能复用缓存。请重新启动 start.cmd 以启用所有更新入口直接联网；重启后需重新登录，已有目标与快照保留。';
  $('#accountSession').textContent=data.sessionActive?'本机会话已连接':'无活动登录会话';
  $('#applyAccount').disabled=!sessionActive;$('#refreshAccount').disabled=!data.sessionActive;
  $('#verifyAccount').hidden=!sessionActive||!snapshot?.verificationRequired;
  if(!sessionActive)login.open=true;
  if(snapshot?.verificationRequired){$('#autoAccount').checked=false;saveAutoPreference();$('#requestPolicy').textContent='自动更新已暂停：官方要求本人验证。不会自动重试或弹出验证；需要时再手动更新。';}
  if(!snapshot){$('#accountSyncStatus').textContent='尚无账号快照。请通过本机登录会话启动同步。';renderLists();return;}
  const role=snapshot.role;$('#accountSyncStatus').textContent=`${role.nickname||'旅行者'} · UID ${role.uid} · ${role.regionName||role.region} · 最近检查 ${new Date(snapshot.checkedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`;
  const notes=snapshot.notes,characters=snapshot.characters,inventory=snapshot.inventory;
  let statistics=$('#syncRequestStats');if(!statistics){statistics=document.createElement('p');statistics.id='syncRequestStats';statistics.className='muted';$('#requestPolicy').after(statistics);}
  statistics.hidden=!snapshot.syncDiagnostics;statistics.textContent=snapshot.syncDiagnostics?`最近一次同步：${snapshot.syncDiagnostics.gameApiRequests} 次数据请求；复用了 ${snapshot.syncDiagnostics.reusedCalculatorDetails} 份角色资料。`:'';
  $('#accountCapabilities').innerHTML=[['实时资源',notes?`树脂 ${notes.resin??'未知'} / ${notes.maxResin??'未知'}；聚宝盆待领宝钱 ${notes.homeCoin??'未知'}；剩余周本折扣 ${notes.weeklyDiscountsRemaining??'未知'}`:'尚未读取',notes?.syncedAt],['角色与武器',characters?`${catalog?accountCharacterRows(snapshot,catalog,getState()).length:characters.items.length} 个角色 / 元素记录 · 本次更新 ${characters.items.filter(c=>(c.syncedAt??characters.syncedAt)===characters.syncedAt).length} 名角色，其余保留各自快照`:'尚未读取',characters?.syncedAt],['浓缩树脂与钱包',inventory?.items.some(m=>m.name==='浓缩树脂'&&!m.minimum)?'浓缩树脂已读取；宝钱钱包仅在接口明确返回余额时同步':'当前接口未提供浓缩树脂数量；请手填并通过完成记录扣减。聚宝盆待领宝钱会同步，钱包余额未提供时须手填',inventory?.syncedAt],['养成材料库存',inventory?`${inventory.items.length} 种 · ${inventory.coverage}`:'未知，未按零库存处理',inventory?.syncedAt]].map(([title,content,at])=>`<article class="material-card"><b>${title}</b><p>${esc(content)}</p><p>${at?esc(new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})):'无成功读取时间'}</p></article>`).join('');
  const errors=Object.entries(snapshot.errors??{});$('#accountErrors').hidden=!errors.length&&!(!sessionActive&&snapshot);$('#accountErrors').textContent=!sessionActive?'当前显示已保存的游戏快照；本机没有活动登录会话，请在下方重新登录。旧快照中的验证码状态不能继续使用。':errors.map(([key,e])=>`${key}：${e.code}`).join('；')+(snapshot.inventory&&!snapshot.errors?.inventory?'。库存已独立同步；上述战绩接口仍需本人验证。':snapshot.verificationRequired?'。官方要求本人验证，请点击「完成本人验证」。':'');renderLists();
 }
 async function load(refresh=false,apply=false,forceResources=false,extraIds=[]){
  if(busy){notify('正在读取网络数据，请等待本次请求完成后再更新');return {error:'REQUEST_IN_PROGRESS'};}
  busy=true;$('#refreshAccount').disabled=true;$('#applyAccount').disabled=true;
  try{
   if(refresh){lastNetworkAttempt=Date.now();$('#accountSyncStatus').textContent='正在联网读取账号资源与所需角色…';}
   const response=await fetch(refresh?'/api/account/refresh':'/api/account',{cache:'no-store',...(refresh?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({characterIds:[...new Set([...requestedCharacters(),...extraIds])]})}:{})});
   const data=await response.json();if(!response.ok)throw new Error(data.error);
   display(data);
   if(refresh&&data.networkRefreshed!==true)throw new Error('旧版服务返回了本地快照，请重新启动服务并登录后更新');
   if(refresh&&!data.updatedSections?.length)throw new Error('官方接口未返回本次可更新的数据；旧值与原时间已保留');
   if(apply&&snapshot){
    const failed=new Set(data.failedSections??[]),fresh=refresh?{...snapshot,notes:failed.has('notes')?null:snapshot.notes,inventory:failed.has('inventory')?null:snapshot.inventory}:snapshot;
    if(refresh&&!data.updatedSections.some(key=>['characters','details','calculatorCharacters'].includes(key)))fresh.characters=null;
    await onSnapshot(fresh,{forceResources,network:refresh});
   }
   if(refresh){const errors=data.failedSections??[];notify(errors.length?'网络读取部分完成；失败项保留旧值与原时间：'+errors.join('、'):'已从网络读取并同步到规划');}
   return data;
  }catch(e){if(e.message==='SESSION_REQUIRED'){sessionActive=false;login.open=true;location.hash='account';$('#accountSession').textContent='无活动登录会话';$('#verifyAccount').hidden=true;e=new Error('请先在下方登录米游社，再从网络更新');}if(refresh)$('#accountSyncStatus').textContent='本次网络更新未完成，已保留旧值：'+e.message;notify('账号更新未完成：'+e.message);return {error:e.message};}
  finally{busy=false;$('#refreshAccount').disabled=!sessionActive;$('#applyAccount').disabled=!sessionActive;}
 }
 function selectionStatus(key,status,message){window.dispatchEvent(new CustomEvent('character-sync-state',{detail:{key,status,message}}));}
 async function syncSelection(version,force=false){
  const key=selectedKey;if(!key||version!==selectionVersion)return;
  if(!force){selectionStatus(key,'cached',characterSyncNeeded(getState(),key)?'当前已读数据不完整或较旧；需要时点击「读取此角色现状」联网更新。':'当前显示已读快照；切换角色不自动联网，需要更新时点击读取按钮。');return;}
  const entry=(catalog?.characters??[]).find(c=>c.key===key),traveler=key.startsWith('traveler');
  if(busy){selectionStatus(key,'waiting','正在完成上一项同步，随后读取此角色…');selectionTimer=setTimeout(()=>syncSelection(version,force),700);return;}
  const started=Date.now();selectionStatus(key,'loading','正在按需读取此角色的等级、突破、三项基础天赋与圣遗物…');
  const data=await load(true,true,force);if(version!==selectionVersion)return;
  if(data?.error){selectionStatus(key,'error','读取未完成：'+data.error);return;}
  const row=data.snapshot?.characters?.items.find(c=>c.id===entry?.id||traveler&&[10000005,10000007].includes(c.id));
  if(row&&Date.parse(row.skillsSyncedAt)>=started&&Date.parse(row.artifactsSyncedAt)>=started&&!characterSyncNeeded(getState(),key)){selectionStatus(key,'success','已从网络读取此角色现状并更新目标。');return;}
  const errors=data?.snapshot?.errors??{};selectionStatus(key,'error',errors.calculatorCharacters||errors.inventory?'官方详情暂未完整返回，请在账号页查看验证状态后重试。':'接口仍未完整返回此角色当前值，请重试或手动核对。');
 }
 window.addEventListener('request-character-sync',event=>{selectedKey=event.detail?.key??null;selectionVersion++;clearTimeout(selectionTimer);const version=selectionVersion;if(selectedKey)selectionTimer=setTimeout(()=>syncSelection(version,event.detail?.force===true),450);});
 $('#ownedCharacters').onclick=e=>{const a=e.target.closest('[data-record-character]');if(a)window.dispatchEvent(new CustomEvent('select-character-record',{detail:a.dataset.recordCharacter}));};
 $('#refreshAccount').onclick=()=>load(true,true,true);$('#applyAccount').onclick=()=>load(true,true,true);$('#ownedSearch').oninput=renderLists;$('#inventorySearch').oninput=renderLists;
 $('#manualAccountLogin').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const form=e.currentTarget;try{const body=JSON.stringify({username:form.elements.username.value,password:form.elements.password.value,characterIds:requestedCharacters()});form.elements.password.value='';const response=await fetch('/api/account/login',{cache:'no-store',method:'POST',headers:{'Content-Type':'application/json'},body});const data=await response.json();if(!response.ok)throw new Error(data.error);display(data);if(snapshot)await onSnapshot(snapshot);window.dispatchEvent(new Event('account-sync-ready'));notify('官方登录成功，已读取接口当前允许的数据');}catch(error){notify('登录或读取未完成：'+error.message);}finally{busy=false;form.elements.password.value='';}};
 await load(false,true);window.dispatchEvent(new Event('account-sync-ready'));
 setInterval(()=>{if(!$('#autoAccount').checked||!sessionActive||document.hidden||busy||snapshot?.verificationRequired||Date.now()-lastNetworkAttempt<1800000||document.activeElement?.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;load(true,true);},60000);
 // Returning from a verification page reads only this local service's saved result.
 window.addEventListener('focus',()=>{if(snapshot?.verificationRequired&&!busy)load(false,true);});
 window.addEventListener('request-account-refresh',async event=>{try{const result=await load(true,true,true,event.detail?.characterIds??[]);if(!result?.error)event.detail?.onSuccess?.();}finally{event.detail?.onComplete?.();}});
}

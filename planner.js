export const DAY=86400000;
export const TRAVELER_ELEMENTS=['anemo','geo','electro','dendro','hydro','pyro','cryo'];
export function emptyTraveler(){return {level:null,ascension:null,talents:Object.fromEntries(TRAVELER_ELEMENTS.map(k=>[k,[null,null,null]]))};}
export function gameDate(now=Date.now()){return new Date(now+4*3600000).toISOString().slice(0,10);}
export function weekday(date){return new Date(date+'T12:00:00Z').getUTCDay();}
export function addDays(date,n){return new Date(Date.parse(date+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);}
export function weekKey(date){return addDays(date,-((weekday(date)+6)%7));}
export function resinNow(profile,now=Date.now()){
 const elapsed=Math.max(0,now-Date.parse(profile.snapshot));
 return Math.min(200,profile.resin+Math.floor(elapsed/480000));
}
export function validate(raw,{now=Date.now()}={}){
 const fail=m=>{throw new Error(m);};
 if(!raw||typeof raw!=='object'||raw.schemaVersion!==1)fail('需要 schemaVersion 为 1 的规划器 JSON；米游社原始响应请先转换为示例格式。');
 const p=raw.profile;
 if(!p||typeof p.name!=='string'||p.name.length>60)fail('账号名称无效');
 if(typeof p.uid!=='string'||(p.uid&&!/^\d{8,10}$/.test(p.uid)))fail('UID 应为空或 8–10 位数字');
 if(!Number.isInteger(p.resin)||p.resin<0||p.resin>200)fail('树脂应为 0–200 的整数');
 if(!Number.isFinite(Date.parse(p.snapshot))||Date.parse(p.snapshot)>now+60000)fail('树脂记录时间无效或晚于当前时间');
 if(!Number.isInteger(p.weeklyClaims)||p.weeklyClaims<0||p.weeklyClaims>50)fail('周本已领奖次数无效');
 if(!Array.isArray(p.claimedBosses)||p.claimedBosses.length>50||p.claimedBosses.some(x=>typeof x!=='string'||x.length>100))fail('周本记录无效');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(p.week))fail('周本记录日期无效');
 if(!Array.isArray(raw.goals)||raw.goals.length>120)fail('最多支持 120 个材料目标');
 const ids=new Set(),bosses=new Set();
 const goals=raw.goals.map(g=>{
  if(!g||typeof g.id!=='string'||!g.id||ids.has(g.id))fail('目标 ID 为空或重复');ids.add(g.id);
  for(const k of ['name','material','location'])if(typeof g[k]!=='string'||!g[k].trim()||g[k].length>100)fail('目标名称、材料和地点应为 1–100 字');
  if(!['domain','boss','weekly','leyline','artifact','supply'].includes(g.type))fail('未知材料类型');
  if(g.type==='weekly'){if(bosses.has(g.location))fail('同一周本请合并为一个材料目标，避免重复领奖');bosses.add(g.location);}
  for(const k of ['need','owned','yield'])if(!Number.isFinite(g[k])||g[k]<0||g[k]>1e9)fail('材料数量无效');
  if(g.yield<=0)fail('每份预计产出必须大于 0');
  if(!Number.isInteger(g.priority)||g.priority<1||g.priority>5)fail('优先级应为 1–5');
  if(!Array.isArray(g.days)||!g.days.length||g.days.some(d=>!Number.isInteger(d)||d<0||d>6))fail('开放日无效');
  if(g.deadline&&(!/^\d{4}-\d{2}-\d{2}$/.test(g.deadline)||!Number.isFinite(Date.parse(g.deadline))))fail('截止日期无效');
  if(!['current','confirmed','unconfirmed'].includes(g.status))fail('情报状态无效');
  return {...Object.fromEntries(['id','name','material','location','type','need','owned','yield','priority','days','deadline','status'].map(k=>[k,g[k]??''])),stockKnown:g.stockKnown!==false};
 });
 const traveler=emptyTraveler();
 if(raw.traveler){
  const input=raw.traveler;
  for(const [key,min,max]of [['level',1,90],['ascension',0,6]]){const value=input[key];if(value!==null&&(!Number.isInteger(value)||value<min||value>max))fail('旅行者共用等级 / 突破阶段无效');traveler[key]=value;}
  for(const element of TRAVELER_ELEMENTS){const values=input.talents?.[element];if(!Array.isArray(values)||values.length!==3||values.some(v=>v!==null&&(!Number.isInteger(v)||v<1||v>10)))fail('旅行者七元素天赋等级无效');traveler.talents[element]=[...values];}
 }
 const characterRecords={};
 if(raw.characterRecords!==undefined){
  if(!raw.characterRecords||typeof raw.characterRecords!=='object'||Array.isArray(raw.characterRecords)||Object.keys(raw.characterRecords).length>300)fail('角色记录无效');
  for(const [key,r]of Object.entries(raw.characterRecords)){
   if(!/^[a-z][a-z0-9]{0,79}$/.test(key)||!r||typeof r!=='object')fail('角色记录键无效');
   for(const [field,min,max]of [['level',1,90],['ascension',0,6]])if(r[field]!==null&&(!Number.isInteger(r[field])||r[field]<min||r[field]>max))fail('角色等级 / 突破阶段无效');
   if(!Array.isArray(r.talents)||r.talents.length!==3||r.talents.some(v=>v!==null&&(!Number.isInteger(v)||v<1||v>10)))fail('角色天赋记录无效');
   if(r.syncedAt!==null&&!Number.isFinite(Date.parse(r.syncedAt)))fail('角色记录时间无效');
   characterRecords[key]={level:r.level,ascension:r.ascension,talents:[...r.talents],source:typeof r.source==='string'?r.source.slice(0,100):'手动记录',syncedAt:r.syncedAt,sharedAt:Number.isFinite(Date.parse(r.sharedAt))?r.sharedAt:null};
  }
 }
 // Migrate legacy traveler data into ordinary character records without losing elements.
 for(const element of TRAVELER_ELEMENTS){const key='traveler'+element;if(!characterRecords[key])characterRecords[key]={level:traveler.level,ascension:traveler.ascension,talents:[...traveler.talents[element]],source:'手动记录',syncedAt:null};}
 const equippedWeapons=[];
 if(raw.equippedWeapons!==undefined){if(!Array.isArray(raw.equippedWeapons)||raw.equippedWeapons.length>300)fail('武器记录无效');for(const w of raw.equippedWeapons){
  if(!w||!Number.isInteger(w.id)||typeof w.key!=='string'||!/^[0-9-]{1,80}$/.test(w.key)||typeof w.holder!=='string'||w.holder.length>100)fail('武器记录无效');
  for(const [key,min,max]of [['level',1,90],['ascension',0,6],['refinement',1,5]])if(w[key]!==null&&(!Number.isInteger(w[key])||w[key]<min||w[key]>max))fail('武器练度记录无效');
  equippedWeapons.push({id:w.id,key:w.key,holder:w.holder,level:w.level,ascension:w.ascension,refinement:w.refinement,syncedAt:Number.isFinite(Date.parse(w.syncedAt))?new Date(w.syncedAt).toISOString():null});
 }}
 let materialInventory=null;if(raw.materialInventory){const inv=raw.materialInventory;if(!Array.isArray(inv.items)||inv.items.length>3000||!Number.isFinite(Date.parse(inv.syncedAt)))fail('材料库存记录无效');materialInventory={syncedAt:inv.syncedAt,items:inv.items.map(m=>{if(!Number.isInteger(m.id)||!Number.isFinite(m.count)||m.count<0||m.count>1e9)fail('材料库存数量无效');return {id:m.id,count:m.count,minimum:m.minimum===true};})};}
 const trainingRequests=[];
 if(raw.trainingRequests!==undefined){if(!Array.isArray(raw.trainingRequests)||raw.trainingRequests.length>120)fail('养成项目过多');const requestIds=new Set(),parts=new Set();for(const r of raw.trainingRequests){
  if(!r||typeof r.id!=='string'||!/^[a-z0-9-]{1,120}$/i.test(r.id)||requestIds.has(r.id)||!['characters','weapons','talents','characterLevel','weaponLevel','artifacts'].includes(r.kind)||typeof r.itemKey!=='string'||!/^[a-z0-9]{1,80}$/.test(r.itemKey)||typeof r.name!=='string'||r.name.length>100)fail('养成项目无效');requestIds.add(r.id);
  const owner=r.itemKey.startsWith('traveler')&&['characters','characterLevel','artifacts'].includes(r.kind)?'traveler':r.itemKey,part=r.kind+'-'+owner+(r.kind==='talents'?'-'+r.slot:'');if(parts.has(part))fail('同一角色或武器的养成子项目不能重复');parts.add(part);
  if(!Number.isInteger(r.slot)||r.slot<0||r.slot>2||!Number.isInteger(r.from)||!Number.isInteger(r.to)||r.from<0||r.to>(r.kind.endsWith('Level')?90:10)||r.to<r.from||r.to===r.from&&r.rows?.length>0||!Array.isArray(r.rows)||r.rows.length>50)fail('养成范围无效');
  trainingRequests.push({id:r.id,kind:r.kind,itemKey:r.itemKey,name:r.name,slot:r.slot,from:r.from,to:r.to,pending:r.pending===true,rows:r.rows.map(m=>{if(!Number.isInteger(m.id)||!Number.isInteger(m.count)||m.count<0||m.count>1e9)fail('养成材料数量无效');return {id:m.id,count:m.count};})});
 }}
 const artifactLoadouts={};if(raw.artifactLoadouts!==undefined){if(!raw.artifactLoadouts||typeof raw.artifactLoadouts!=='object'||Object.keys(raw.artifactLoadouts).length>300)fail('圣遗物配装无效');for(const [key,loadout]of Object.entries(raw.artifactLoadouts)){
  if(!/^[a-z0-9]{1,80}$/.test(key)||!loadout||!Array.isArray(loadout.items)||loadout.items.length>5)fail('圣遗物配装无效');const slots=new Set();artifactLoadouts[key]={complete:loadout.complete===true,syncedAt:Number.isFinite(Date.parse(loadout.syncedAt))?new Date(loadout.syncedAt).toISOString():null,items:loadout.items.map(a=>{
   if(!a||!Number.isInteger(a.pos)||a.pos<1||a.pos>5||slots.has(a.pos)||!Number.isInteger(a.rarity)||a.rarity<1||a.rarity>5||!Number.isInteger(a.level)||a.level<0||a.level>[0,4,4,12,16,20][a.rarity])fail('圣遗物星级、等级或部位无效');slots.add(a.pos);if(a.levelExp!==null&&a.levelExp!==undefined&&(!Number.isInteger(a.levelExp)||a.levelExp<0||a.levelExp>40000))fail('圣遗物级内经验无效');return {id:Number.isInteger(a.id)?a.id:null,pos:a.pos,name:typeof a.name==='string'?a.name.slice(0,100):'',setName:typeof a.setName==='string'?a.setName.slice(0,100):'',rarity:a.rarity,level:a.level,levelExp:a.levelExp??null};})};
 }}
 return {schemaVersion:1,profile:{name:p.name,uid:p.uid,adventureRank:Number.isInteger(p.adventureRank)&&p.adventureRank>=1&&p.adventureRank<=60?p.adventureRank:null,resin:p.resin,snapshot:new Date(p.snapshot).toISOString(),weeklyClaims:p.weeklyClaims,claimedBosses:[...p.claimedBosses],week:p.week},goals,traveler,characterRecords,equippedWeapons,materialInventory,trainingRequests,artifactLoadouts,economy:normalizeEconomy(raw.economy)};
}
// Each day uses a multiple-choice knapsack. Seven days are simulated in order;
// this is a rolling heuristic across days, not a global optimality claim.
function basePlan(state,{now=Date.now(),horizon=7}={}){
 const start=gameDate(now),goals=structuredClone(state.goals),out=[];
 let condensed=state.economy?.condensed??0;
 let balance=resinNow(state.profile,now),week=state.profile.week,claims=state.profile.weeklyClaims,claimed=new Set(state.profile.claimedBosses);
 for(let d=0;d<horizon;d++){
  const date=addDays(start,d);if(weekKey(date)!==week){week=weekKey(date);claims=0;claimed.clear();}
  const lost=d?Math.max(0,balance+180-200):0;
  if(d)balance=Math.min(200,balance+180);
  const budget=balance;let dp=new Map([['0:0:0',{spent:0,score:0,picks:[],weekly:0,condensed:0}]]);
  for(let i=0;i<goals.length;i++){
   const g=goals[i];if(g.type==='supply'||g.stockKnown===false||g.status==='unconfirmed'||g.owned>=g.need||!g.days.includes(weekday(date))||(g.type==='weekly'&&claimed.has(g.location)))continue;
   const cost=g.type==='boss'?40:g.type==='weekly'?(claims<3?30:60):20;
   const max=g.type==='weekly'?1:Math.min(Math.ceil((g.need-g.owned)/g.yield)+(cost===20&&condensed?2:0),Math.floor(budget/cost)+(cost===20?condensed*3:0));
   const next=new Map(dp);
   for(const prev of dp.values())for(let n=1;n<=max;n++)for(let c=0;c<=(cost===20?Math.min(condensed-prev.condensed,Math.floor(n/3)):0);c++){
    // Weekly discount depends on all previously selected weekly bosses.
    let spend=cost*n-c*60;
    if(g.type==='weekly')spend=claims+prev.weekly<3?30:60;
    if(prev.spent+spend>budget)continue;
    const gap=g.need-g.owned,progress=Math.min(gap,n*g.yield)/Math.max(g.need,1);
    const daysLeft=g.deadline?Math.round((Date.parse(g.deadline)-Date.parse(date))/DAY):999;
    const urgency=daysLeft<=0?2:daysLeft<=3?1.7:daysLeft<=7?1.3:1;
    const scarcity=g.days.length<7?1.15:1;
    const score=prev.score+progress*g.priority*100*urgency*scarcity;
    const total=prev.spent+spend,weekly=prev.weekly+(g.type==='weekly'?1:0),used=prev.condensed+c,key=total+':'+weekly+':'+used;
    if(!next.has(key)||score>next.get(key).score)next.set(key,{spent:total,score,picks:[...prev.picks,{index:i,count:n,cost:spend,condensed:c}],weekly,condensed:used});
   }
   dp=next;
  }
  let best=dp.get('0:0:0');for(const v of dp.values())if(v.score>best.score+1e-9||(Math.abs(v.score-best.score)<1e-9&&v.spent<best.spent))best=v;const spent=best.spent;
  const tasks=best.picks.map(p=>{const g=goals[p.index];g.owned+=p.count*g.yield;if(g.type==='weekly'){claims++;claimed.add(g.location);}return {...g,count:p.count,cost:p.cost,condensed:p.condensed,expected:p.count*g.yield};});
  balance-=spent;condensed-=best.condensed;out.push({date,budget,spent,left:balance,lost,tasks,condensedUsed:best.condensed});
 }
 return out;
}

export const POT_SHOP=[
 {id:'transient',name:'须臾树脂',price:1200,limit:1,trust:6,material:'树脂',amount:60},
 {id:'wit',name:'大英雄的经验',price:120,limit:20,trust:8,material:'角色经验',amount:20000},
 {id:'wanderer',name:'流浪者的经验 ×10',price:60,limit:10,trust:8,material:'角色经验',amount:10000},
 {id:'mora',name:'摩拉 ×10000',price:120,limit:20,trust:8,material:'摩拉',amount:10000},
 {id:'ore',name:'精锻用魔矿',price:60,limit:40,trust:8,material:'武器经验',amount:10000},
 {id:'essence',name:'祝圣精华',price:360,limit:5,trust:8,material:'圣遗物经验',amount:10000},
 {id:'unction',name:'祝圣油膏',price:90,limit:20,trust:8,material:'圣遗物经验',amount:2500}
];
export function normalizeEconomy(input={}){
 const fail=m=>{throw new Error(m);},e={};if(!input||typeof input!=='object')fail('资源设置无效');
 for(const [key,max]of [['condensed',5],['cores',1e9],['mora',1e9],['coins',1e9],['jar',2400],['coinCap',2400],['coinRate',30],['trust',10]]){
  const v=input[key]??(key==='trust'||key==='coinRate'?0:key==='coinCap'?2400:null);
  if(v!==null&&(!Number.isInteger(v)||v<0||v>max))fail('资源数量无效：'+key);e[key]=v;
 }
 for(const key of ['craft','shop'])e[key]=input[key]===true;
 e.resourceTimes={};for(const key of ['condensed','cores','mora','coins','jar','coinCap','coinRate','trust'])if(Number.isFinite(Date.parse(input.resourceTimes?.[key])))e.resourceTimes[key]=new Date(input.resourceTimes[key]).toISOString();
 e.purchaseWeek=typeof input.purchaseWeek==='string'?input.purchaseWeek:'';e.purchases={};
 for(const item of POT_SHOP){const count=input.purchases?.[item.id]??0;if(!Number.isInteger(count)||count<0||count>item.limit)fail('洞天百宝已购数量无效');e.purchases[item.id]=count;}
 e.events=[];if(input.events!==undefined){if(!Array.isArray(input.events)||input.events.length>40)fail('活动奖励最多 40 项');const ids=new Set();for(const r of input.events){
  if(!r||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(r.id)||ids.has(r.id))fail('活动奖励 ID 无效或重复');ids.add(r.id);
  for(const k of ['name','material'])if(typeof r[k]!=='string'||!r[k].trim()||r[k].length>100)fail('活动名称或奖励材料无效');
  for(const k of ['date','end'])if(!/^\d{4}-\d{2}-\d{2}$/.test(r[k])||!Number.isFinite(Date.parse(r[k])))fail('活动日期无效');
  if(r.date>r.end||!Number.isFinite(r.amount)||r.amount<=0||r.amount>1e9)fail('活动时间或数量无效');
  if(typeof r.source!=='string'||r.source.length>1000||!/^https:\/\//.test(r.source))fail('活动必须附 HTTPS 公告来源');
  e.events.push({id:r.id,name:r.name,material:r.material,amount:r.amount,date:r.date,end:r.end,source:r.source,confirmed:r.confirmed===true,eligible:r.eligible===true});
 }}
 if(input.done!==undefined&&(!Array.isArray(input.done)||input.done.length>1000||input.done.some(v=>typeof v!=='string'||v.length>120)))fail('日程完成记录无效');e.done=[...(input.done??[])];
 return e;
}
function grant(goals,material,amount){
 // A shared material reward is allocated once, in priority order.
 for(const g of [...goals].filter(g=>g.material===material&&g.stockKnown!==false&&g.status!=='unconfirmed').sort((a,b)=>b.priority-a.priority)){
  const take=Math.min(amount,Math.max(0,g.need-g.owned));g.owned+=take;amount-=take;if(amount<=0)break;
 }
}
function consume(goals,material,amount){for(const g of [...goals].filter(g=>g.material===material).sort((a,b)=>a.priority-b.priority)){const take=Math.min(amount,g.owned);g.owned-=take;amount-=take;if(amount<=0)break;}}
function gapFor(goals,material){return goals.filter(g=>g.material===material&&g.stockKnown!==false&&g.status!=='unconfirmed').reduce((n,g)=>n+Math.max(0,g.need-g.owned),0);}
export function materialCraftingPlan(state,recipes=[]){
 const rank=state.profile.adventureRank;if(!Number.isInteger(rank))return {actions:[],mora:0};
 const eligible=recipes.filter(r=>r.unlockRank<=rank&&r.inputCount===3&&r.outputCount===1&&Number.isInteger(r.mora)&&r.mora>=0),byOutput=new Map(eligible.map(r=>[r.outputId,r])),pool=new Map((state.materialInventory?.items??[]).map(m=>[m.id,m.count])),needs=new Map(),actions=[];
 for(const g of state.goals){if(g.status==='unconfirmed')continue;const id=Number(g.id.replace('training-material-',''));if(!g.id.startsWith('training-material-')||!Number.isInteger(id)||id<=0)continue;needs.set(id,(needs.get(id)??0)+g.need);if(!pool.has(id)&&g.stockKnown!==false)pool.set(id,g.owned);}
 function ensure(id,amount,seen=new Set()){
  const recipe=byOutput.get(id);if(!recipe||seen.has(id))return;const missing=Math.max(0,amount-(pool.get(id)??0));if(!missing)return;
  const next=new Set(seen);next.add(id);ensure(recipe.inputId,(needs.get(recipe.inputId)??0)+missing*3,next);
  const count=Math.min(Math.ceil(missing),Math.floor(Math.max(0,(pool.get(recipe.inputId)??0)-(needs.get(recipe.inputId)??0))/3));if(!count)return;
  pool.set(recipe.inputId,pool.get(recipe.inputId)-count*3);pool.set(id,(pool.get(id)??0)+count);
  actions.push({kind:'materialCraft',recipeId:recipe.id,count,inputId:recipe.inputId,outputId:id,mora:count*recipe.mora,title:`炼金台：${recipe.inputName} ×${count*3} → ${recipe.outputName} ×${count}，消耗 ${count*recipe.mora} 摩拉`});
 }
 for(const [id,count]of needs)ensure(id,count);
 return {actions,mora:actions.reduce((n,a)=>n+a.mora,0)};
}
function applyMaterialCraft(state,action,recipes,{deductGoalsMora=true}={}){
 const r=recipes.find(r=>r.id===action.recipeId),n=action.count,e=state.economy;
 if(!r||!Number.isInteger(n)||n<=0||state.profile.adventureRank<r.unlockRank||e.mora===null||e.mora<n*r.mora)throw new Error('合成配方、解锁条件或摩拉不足');
 const input=state.materialInventory?.items.find(m=>m.id===r.inputId);if(!input||input.count<n*3)throw new Error('低阶材料库存不足或未知');
 const reserved=state.goals.filter(g=>g.id==='training-material-'+r.inputId&&g.status!=='unconfirmed').reduce((s,g)=>s+g.need,0);if(input.count-n*3<reserved)throw new Error('需保留低阶材料用于已有目标');
 input.count-=n*3;let output=state.materialInventory.items.find(m=>m.id===r.outputId);if(!output){output={id:r.outputId,count:0};state.materialInventory.items.push(output);}output.count+=n;
 for(const g of state.goals)if(g.id==='training-material-'+r.outputId)g.stockKnown=true;
 grant(state.goals,r.outputName,n);e.mora-=n*r.mora;if(deductGoalsMora)consume(state.goals,'摩拉',n*r.mora);
}
export function plan(state,{now=Date.now(),horizon=7,recipes=[]}={}){
 const sim=structuredClone(state),e=normalizeEconomy(state.economy),out=[],start=gameDate(now);sim.economy=e;
 let balance=resinNow(state.profile,now);
 const alchemy=materialCraftingPlan(sim,recipes),craftQueue=[...alchemy.actions];
 if(alchemy.mora){const g=sim.goals.find(g=>g.material==='摩拉'&&g.status!=='unconfirmed');if(g)g.need+=alchemy.mora;else sim.goals.push({id:'alchemy-mora',name:'材料合成费用',material:'摩拉',need:alchemy.mora,owned:e.mora??0,stockKnown:e.mora!==null,location:'藏金之花',type:'leyline',yield:60000,priority:5,days:[0,1,2,3,4,5,6],status:'current',deadline:''});}
 for(let d=0;d<horizon;d++){
  const date=addDays(start,d),at=now+d*DAY,actions=[];
  if(d===0)for(const g of sim.goals)if(g.status!=='unconfirmed'&&(g.stockKnown===false||g.type==='supply'&&g.owned<g.need))actions.push({kind:'advice',preparation:true,title:g.stockKnown===false?`核对 ${g.material} 库存，需求 ${g.need}；填入目标后启用排程`:`提前筹备 ${g.material}，尚缺 ${g.need-g.owned}：${g.location}（取得后更新库存）`});
  const lost=d?Math.max(0,balance+180-200):0;if(d)balance=Math.min(200,balance+180);
  if(e.purchaseWeek!==weekKey(date)){e.purchaseWeek=weekKey(date);e.purchases=Object.fromEntries(POT_SHOP.map(p=>[p.id,0]));}
  if(d&&e.jar!==null)e.jar=Math.min(e.coinCap,e.jar+24*e.coinRate);
  if(e.shop&&e.jar>0&&e.coins!==null){const amount=e.jar;actions.push({kind:'collect',title:`进入尘歌壶，领取 ${amount} 洞天宝钱`,amount});e.coins+=amount;e.jar=0;}
  for(const r of e.events){if(!r.confirmed||!r.eligible||e.done.includes(r.id)||r.date>date||r.end<date)continue;
   actions.push({kind:'reward',title:`完成并领取「${r.name}」：${r.amount} ${r.material}`,eventId:r.id,material:r.material,amount:r.amount,source:r.source});grant(sim.goals,r.material,r.amount);if(r.material==='摩拉'&&e.mora!==null)e.mora+=r.amount;e.done.push(r.id);
  }
  if(e.shop&&e.coins!==null){
   const candidates=POT_SHOP.filter(p=>p.id!=='transient'&&p.trust<=e.trust).sort((a,b)=>{
    const weight=p=>Math.max(0,...sim.goals.filter(g=>g.material===p.material&&g.need>g.owned).map(g=>g.priority))*p.amount/p.price/(p.material==='摩拉'?60000:p.material==='角色经验'?122500:10000);return weight(b)-weight(a);
   });
   // Resin is bought only when it can immediately be spent; no expiry bookkeeping is hidden.
   if(e.trust>=6&&!e.purchases.transient&&e.coins>=1200&&balance<=140&&sim.goals.some(g=>g.stockKnown!==false&&g.type!=='supply'&&g.status!=='unconfirmed'&&g.need>g.owned&&g.days.includes(weekday(date)))){
    actions.push({kind:'exchange',title:'洞天百宝：1200 宝钱兑换须臾树脂 ×1，并立即使用（恢复 60）',shopId:'transient',count:1,coins:1200,material:'树脂',amount:60});e.coins-=1200;e.purchases.transient=1;balance+=60;
   }
   const reserve=e.trust>=6&&!e.purchases.transient&&e.coins>=1200&&sim.goals.some(g=>g.stockKnown!==false&&g.type!=='supply'&&g.status!=='unconfirmed'&&g.need>g.owned)?1200:0;
   for(const p of candidates){const count=Math.min(p.limit-e.purchases[p.id],Math.floor((e.coins-reserve)/p.price),Math.ceil(gapFor(sim.goals,p.material)/p.amount));if(count<=0)continue;
    actions.push({kind:'exchange',title:`洞天百宝：${p.price*count} 宝钱兑换 ${p.name} ×${count}`,shopId:p.id,count,coins:p.price*count,material:p.material,amount:p.amount*count});e.coins-=p.price*count;e.purchases[p.id]+=count;grant(sim.goals,p.material,p.amount*count);if(p.material==='摩拉'&&e.mora!==null)e.mora+=p.amount*count;
   }
  }
  sim.profile.resin=balance;sim.profile.snapshot=new Date(at).toISOString();
  while(craftQueue.length&&e.mora!==null&&e.mora>=craftQueue[0].mora){const action=craftQueue.shift();applyMaterialCraft(sim,action,recipes,{deductGoalsMora:false});actions.push(action);}
  if(craftQueue.length)actions.push({kind:'advice',title:`待合成材料另需 ${craftQueue.reduce((n,a)=>n+a.mora,0)} 摩拉；先补足可用摩拉，再前往炼金台`});
  const candidate=structuredClone(sim);
  // Known ingredients already reserved for pending crafts do not need resin farming.
  for(const a of craftQueue)for(const g of candidate.goals)if(g.id==='training-material-'+a.outputId){g.stockKnown=true;g.owned+=a.count;}
  // Confirmed future rewards reserve the corresponding need until their claim day.
  for(const r of e.events)if(r.confirmed&&r.eligible&&!e.done.includes(r.id)&&r.date>date){const validGoals=candidate.goals.filter(g=>!g.deadline||r.date<=g.deadline);grant(validGoals,r.material,r.amount);}
  const day=basePlan(candidate,{now:at,horizon:1})[0];
  let useCrafted=0;
  function appendFight(t,prefix='挑战'){
   const craftCount=e.craft&&e.condensed!==null&&e.cores!==null&&e.mora!==null&&['domain','leyline','artifact'].includes(t.type)?Math.max(0,Math.min(5-e.condensed,e.cores,Math.floor(e.mora/100),Math.floor(t.cost/60))):0;
   if(craftCount){actions.push({kind:'craft',purpose:'use',title:`打本前合成浓缩树脂 ×${craftCount}：${craftCount*60} 原粹树脂 + ${craftCount} 晶核 + ${craftCount*100} 摩拉，本日使用`,count:craftCount});e.condensed+=craftCount;e.cores-=craftCount;e.mora-=craftCount*100;consume(sim.goals,'摩拉',craftCount*100);useCrafted+=craftCount;t.cost-=craftCount*60;t.condensed+=craftCount;}
   sim.goals.find(g=>g.id===t.id).owned+=t.expected;actions.push({kind:'fight',title:`${prefix} ${t.location}（${t.cost} 原粹树脂）：${t.count-t.condensed*3} 次原粹领取${t.condensed?' + 浓缩树脂 ×'+t.condensed:''}，预计 ${Number(t.expected.toFixed(2))} ${t.material}`,task:t});if(t.material==='摩拉'&&e.mora!==null)e.mora+=t.expected;
   if(e.condensed!==null)e.condensed-=t.condensed;
  }
  for(const t of day.tasks)appendFight(t);
  balance=day.left;
  if(sim.profile.week!==weekKey(date)){sim.profile.week=weekKey(date);sim.profile.weeklyClaims=0;sim.profile.claimedBosses=[];}
  for(const t of day.tasks)if(t.type==='weekly'){sim.profile.weeklyClaims++;sim.profile.claimedBosses.push(t.location);}
  if(e.shop&&e.trust>=6&&!e.purchases.transient&&e.coins>=1200&&balance<=140&&sim.goals.some(g=>g.stockKnown!==false&&g.type!=='supply'&&g.status!=='unconfirmed'&&g.need>g.owned&&g.days.includes(weekday(date)))){
   actions.push({kind:'exchange',title:'打本后前往洞天百宝：1200 宝钱兑换须臾树脂 ×1，并立即使用（恢复 60）',shopId:'transient',count:1,coins:1200,material:'树脂',amount:60});e.coins-=1200;e.purchases.transient=1;balance+=60;
   sim.profile.resin=balance;const extraCandidate=structuredClone(sim);for(const a of craftQueue)for(const g of extraCandidate.goals)if(g.id==='training-material-'+a.outputId){g.stockKnown=true;g.owned+=a.count;}for(const r of e.events)if(r.confirmed&&r.eligible&&!e.done.includes(r.id)&&r.date>date)grant(extraCandidate.goals.filter(g=>!g.deadline||r.date<=g.deadline),r.material,r.amount);
   const extra=basePlan(extraCandidate,{now:at,horizon:1})[0];for(const t of extra.tasks){appendFight(t,'补充树脂后挑战');if(t.type==='weekly'){sim.profile.weeklyClaims++;sim.profile.claimedBosses.push(t.location);}}
   day.tasks.push(...extra.tasks);day.spent+=extra.spent;day.condensedUsed+=extra.condensedUsed;balance=extra.left;day.budget+=60;
  }
  // Crafts waiting only for Mora can be done immediately after today's ley lines.
  while(craftQueue.length&&e.mora!==null&&e.mora>=craftQueue[0].mora){const action=craftQueue.shift();applyMaterialCraft(sim,action,recipes,{deductGoalsMora:false});actions.push(action);}
  if(!craftQueue.length)for(let i=actions.length-1;i>=0;i--)if(actions[i].kind==='advice'&&actions[i].title.startsWith('待合成材料另需'))actions.splice(i,1);
  const craft=e.craft&&e.condensed!==null&&e.cores!==null&&e.mora!==null?Math.min(5-e.condensed,e.cores,Math.floor(e.mora/100),Math.floor(balance/60),Math.ceil(Math.max(0,balance+180-200)/60)):0;
  if(craft){actions.push({kind:'craft',title:`合成浓缩树脂 ×${craft}：${craft*60} 原粹树脂 + ${craft} 晶核 + ${craft*100} 摩拉，留待后续开放日`,count:craft});balance-=craft*60;e.condensed+=craft;e.cores-=craft;e.mora-=craft*100;consume(sim.goals,'摩拉',craft*100);}
  const reason=!e.craft?'浓缩合成策略未启用':[e.condensed,e.cores,e.mora].some(v=>v===null)?'浓缩树脂、晶核或摩拉库存未知':e.condensed>=5?'浓缩树脂已达持有上限':e.cores<1?'晶核不足':e.mora<100?'摩拉不足':balance<60?'剩余原粹不足60，今日打本无可浓缩的整组三份奖励':'无需储存，今日打本无可浓缩的整组三份奖励';
  const resinCrafting={count:useCrafted+craft,useCount:useCrafted,storeCount:craft,reason:useCrafted+craft?'按本日打本和防溢出需要合成':reason};
  out.push({...day,date,budget:day.budget,spent:day.spent+craft*60,left:balance,lost,actions,alchemyMora:alchemy.mora,condensedLeft:e.condensed,condensedUsed:day.condensedUsed+useCrafted,resinCrafting});
 }
 return out;
}
export function completeAction(state,action,{now=Date.now(),actual,recipes=[]}={}){
 const next=structuredClone(state),e=normalizeEconomy(next.economy),p=next.profile;next.economy=e;p.resin=resinNow(p,now);p.snapshot=new Date(now).toISOString();
 const date=gameDate(now);if(p.week!==weekKey(date)){p.week=weekKey(date);p.weeklyClaims=0;p.claimedBosses=[];}
 if(e.purchaseWeek!==weekKey(date)){e.purchaseWeek=weekKey(date);e.purchases=Object.fromEntries(POT_SHOP.map(p=>[p.id,0]));}
 if(action.kind==='fight'){
  const t=action.task;if(t.id==='alchemy-mora'){const cost=materialCraftingPlan(next,recipes).mora;if(!cost)throw new Error('合成需求已变化');next.goals.push({id:'alchemy-mora',name:'材料合成费用',material:'摩拉',type:'leyline',location:'藏金之花',need:cost,owned:e.mora??0,stockKnown:e.mora!==null,yield:60000,priority:5,days:[0,1,2,3,4,5,6],status:'current',deadline:''});}const g=next.goals.find(g=>g.id===t.id);if(!g||g.owned>=g.need||!g.days.includes(weekday(date)))throw new Error('目标已变化，请重新规划');
  const cost=t.type==='weekly'?(p.weeklyClaims<3?30:60):t.cost;if(p.resin<cost||(e.condensed??0)<t.condensed||t.type==='weekly'&&p.claimedBosses.includes(t.location))throw new Error('树脂或周本状态已变化，请重新规划');
  if(!Number.isFinite(actual)||actual<0||actual>1e9)throw new Error('实际产出无效');p.resin-=cost;if(e.condensed!==null)e.condensed-=t.condensed;g.owned+=actual;if(t.material==='摩拉'&&e.mora!==null)e.mora+=actual;
  if(t.type==='weekly'){p.weeklyClaims++;p.claimedBosses.push(t.location);}
 }else if(action.kind==='materialCraft'){
  const available=materialCraftingPlan(next,recipes).actions.find(a=>a.recipeId===action.recipeId);if(!available||action.count>available.count)throw new Error('合成需求已变化，请重新规划');applyMaterialCraft(next,action,recipes);next.materialInventory.syncedAt=new Date(now).toISOString();const money=next.materialInventory.items.find(m=>m.id===202);if(money)money.count=e.mora;
 }else if(action.kind==='craft'){
  const n=action.count;if(e.condensed===null||e.cores===null||e.mora===null||p.resin<n*60||e.cores<n||e.mora<n*100||e.condensed+n>5)throw new Error('合成材料或树脂不足');p.resin-=n*60;e.cores-=n;e.mora-=n*100;e.condensed+=n;consume(next.goals,'摩拉',n*100);
 }else if(action.kind==='collect'){
  if(e.coins===null||e.jar===null||e.jar<action.amount)throw new Error('请先更新宝钱与聚宝盆记录');e.jar-=action.amount;e.coins+=action.amount;
 }else if(action.kind==='reward'){
  const r=e.events.find(r=>r.id===action.eventId);if(!r||!r.confirmed||!r.eligible||r.date>date||r.end<date||e.done.includes(r.id))throw new Error('奖励不可领取或已经记录');e.done.push(r.id);grant(next.goals,r.material,r.amount);if(r.material==='摩拉'&&e.mora!==null)e.mora+=r.amount;
 }else if(action.kind==='exchange'){
  const shop=POT_SHOP.find(p=>p.id===action.shopId),n=action.count;if(!shop||e.coins===null||e.trust<shop.trust||e.coins<shop.price*n||e.purchases[shop.id]+n>shop.limit)throw new Error('宝钱、解锁条件或本周限购不足');if(shop.id==='transient'&&p.resin>140)throw new Error('请先消耗树脂，避免立即使用须臾树脂时溢出');
  e.coins-=shop.price*n;e.purchases[shop.id]+=n;if(shop.id==='transient')p.resin+=60;else{grant(next.goals,shop.material,shop.amount*n);if(shop.material==='摩拉'&&e.mora!==null)e.mora+=shop.amount*n;}
 }else throw new Error('此条为提示，无需记录完成');
 for(const key of ['condensed','cores','mora','coins','jar'])if(e[key]!==normalizeEconomy(state.economy)[key])e.resourceTimes[key]=new Date(now).toISOString();
 next.goals=next.goals.filter(g=>g.id!=='alchemy-mora');return validate(next,{now});
}

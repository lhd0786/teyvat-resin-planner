const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const label=v=>typeof v==='string'?v.slice(0,100):'';
export function ascensionFromLevel(level){if(!Number.isInteger(level)||level<1||level>90||[20,40,50,60,70,80].includes(level))return null;return level<20?0:level<40?1:level<50?2:level<60?3:level<70?4:level<80?5:6;}
export function catalogProgress(state,kind,item,instance=''){
 if(kind==='weapons'){const rows=(state.equippedWeapons??[]).filter(w=>w.id===item.id),w=rows.find(w=>w.key===instance)??rows[0];return {level:w?.level??null,ascension:w?.ascension??ascensionFromLevel(w?.level),talents:[null,null,null],instances:rows};}
 const r=characterRecord(state,item.key);return {...r,ascension:r.ascension??ascensionFromLevel(r.level),instances:[]};
}
const elements=['anemo','geo','electro','dendro','hydro','pyro','cryo'];
const elementNames=['风','岩','雷','草','水','火','冰'];
function travelerElement(value){const v=String(value??'').toLowerCase();return elements.find((e,i)=>v===e||v===elementNames[i]||v===({anemo:'wind',geo:'rock',electro:'electric',dendro:'grass',hydro:'water',pyro:'fire',cryo:'ice'}[e]));}
export function characterEntries(catalog){return [...(catalog?.characters??[]).filter(c=>!['aether','lumine'].includes(c.key)),...(catalog?.travelerForms??[])];}
export function characterRecord(state,key){
 const saved=state.characterRecords?.[key];if(saved)return structuredClone(saved);
 if(key.startsWith('traveler')&&elements.includes(key.slice(8))){const t=state.traveler;return {level:t?.level??null,ascension:t?.ascension??null,talents:[...(t?.talents?.[key.slice(8)]??[null,null,null])],source:'手动记录',syncedAt:null};}
 return {level:null,ascension:null,talents:[null,null,null],source:'手动记录',syncedAt:null};
}
export function requestedCharacterIds(state,catalog,selectedKey=null,snapshot=null){
 const keys=new Set((state.trainingRequests??[]).filter(r=>!['weapons','weaponLevel'].includes(r.kind)).map(r=>r.itemKey));if(selectedKey)keys.add(selectedKey);
 const ids=(catalog?.characters??[]).filter(c=>keys.has(c.key)).map(c=>c.id);
 for(const r of state.trainingRequests??[])if(['weapons','weaponLevel'].includes(r.kind))for(const w of state.equippedWeapons??[])if(w.id===catalog?.weapons?.find(v=>v.key===r.itemKey)?.id)ids.push(w.holderId??Number(w.key.split('-')[0]));
 if([...keys].some(k=>k.startsWith('traveler')))for(const c of snapshot?.characters?.items??[])if([10000005,10000007].includes(c.id))ids.push(c.id);
 return [...new Set(ids)].filter(Number.isInteger);
}
export function characterSyncNeeded(state,key,{now=Date.now(),maxAge=300000}={}){
 const r=characterRecord(state,key),loadout=state.artifactLoadouts?.[key.startsWith('traveler')?'traveler':key];
 return r.level===null||r.ascension===null||r.talents.some(v=>v===null)||!r.source?.includes('养成计算器')||!Number.isFinite(Date.parse(r.syncedAt))||now-Date.parse(r.syncedAt)>maxAge||!loadout?.complete;
}
export function saveCharacterRecord(state,key,record){
 const next=structuredClone(state);next.characterRecords??={};next.characterRecords[key]=structuredClone(record);
 if(key.startsWith('traveler')&&elements.includes(key.slice(8))){
  next.traveler??={level:null,ascension:null,talents:Object.fromEntries(elements.map(e=>[e,[null,null,null]]))};
  next.traveler.level=record.level;next.traveler.ascension=record.ascension;next.traveler.talents[key.slice(8)]=[...record.talents];
  for(const element of elements){const k='traveler'+element,old=characterRecord(next,k);next.characterRecords[k]={...old,level:record.level,ascension:record.ascension,sharedAt:record.sharedAt??record.syncedAt};}
 }
 return next;
}
// A record API reports the active element only. Never copy its skills to other elements.
export function accountCharacterRows(snapshot,catalog,state={}){
 const entries=characterEntries(catalog),rows=new Map();
 for(const c of snapshot?.characters?.items??[]){
  if([10000005,10000007].includes(c.id)){
   const active=travelerElement(c.element);
   for(const form of catalog?.travelerForms??[]){const record=characterRecord(state,form.key);rows.set(form.key,{...c,...record,key:form.key,name:form.name,element:form.element,level:c.level??record.level,ascension:c.ascension??record.ascension,skills:active===form.key.slice(8)?c.skills:null,activeElement:active===form.key.slice(8)});}
  }else{const entry=entries.find(e=>e.id===c.id);if(entry)rows.set(entry.key,{...c,key:entry.key,...characterRecord(state,entry.key),name:c.name,element:c.element});}
 }
 for(const entry of entries){const r=characterRecord(state,entry.key);if(rows.has(entry.key)||!(r.level!==null||r.ascension!==null||r.talents.some(v=>v!==null)))continue;rows.set(entry.key,{...r,key:entry.key,name:entry.name,element:entry.element,skills:null,weapon:null,constellation:null});}
 return [...rows.values()];
}
export function normalizeAccount(raw){
 const source='米游社官方接口',at=raw.syncedAt,role=raw.role??{};
 const details=new Map((raw.details?.list??[]).map(c=>[c.id??c.base?.id,{...c.base,...c}]));
 const calculators=new Map((raw.calculatorCharacters?.list??[]).map(c=>[c.id,c]));
 const bases=raw.characters?.list??raw.details?.list?.map(c=>c.base??c)??(calculators.size?[...calculators.values()]:undefined);
 const characters=Array.isArray(bases)?{syncedAt:at,source,items:bases.map(base=>{
  const c={...base,...details.get(base.id)},calc=calculators.get(base.id),w=calc?.weapon??c.weapon;
  const skills=Array.isArray(calc?.skill_list)?calc.skill_list.filter(s=>s.max_level>1).map(s=>{const order=s.group_id%10,slot=String(s.id).length===6?0:({1:0,2:1,9:2}[order]??null);return {id:s.id,name:label(s.name),level:finite(s.level_current),baseLevel:finite(s.level_current),slot,type:null};}):Array.isArray(c.skills)?c.skills.map(s=>({id:s.skill_id,name:label(s.name),level:finite(s.level),baseLevel:finite(s.base_level),type:finite(s.skill_type)})):null;
  const relics=calc?.reliquary_list??c.relics??c.reliquaries;
  return {id:c.id,name:label(c.name),element:label(c.element)||({1:'Pyro',2:'Anemo',3:'Geo',4:'Dendro',5:'Electro',6:'Hydro',7:'Cryo'}[calc?.element_attr_id]??''),level:finite(calc?.level_current)??finite(c.level),ascension:finite(calc?.promote_level)??finite(c.promote_level)??ascensionFromLevel(calc?.level_current??c.level),rarity:finite(calc?.avatar_level)??finite(c.rarity),constellation:finite(calc?.constellation_num)??finite(c.actived_constellation_num),friendship:finite(calc?.fetter_level)??finite(c.fetter),skills,artifacts:Array.isArray(relics)?relics.map(a=>({id:a.id,pos:finite(a.reliquary_cat_id)??finite(a.pos),name:label(a.name),setName:label(a.set?.name),rarity:finite(a.reliquary_level)??finite(a.rarity),level:finite(a.level_current)??finite(a.level),levelExp:0})):null,weapon:w?{id:w.id,name:label(w.name),level:finite(w.level_current)??finite(w.level),ascension:finite(w.promote_level)??ascensionFromLevel(w.level_current??w.level),rarity:finite(w.weapon_level)??finite(w.rarity),refinement:finite(w.affix_level)}:null,syncedAt:at,skillsSyncedAt:skills?at:null,artifactsSyncedAt:Array.isArray(relics)?at:null,weaponSyncedAt:w?at:null,source:calc?'米游社养成计算器':source};
 })}:null;
 const n=raw.notes;
 const notes=n?{syncedAt:at,source,resin:finite(n.current_resin),maxResin:finite(n.max_resin),resinRecoverySeconds:Number.isFinite(Number(n.resin_recovery_time))?Number(n.resin_recovery_time):null,homeCoin:finite(n.current_home_coin),maxHomeCoin:finite(n.max_home_coin),dailyCompleted:finite(n.finished_task_num),dailyTotal:finite(n.total_task_num),weeklyDiscountsRemaining:finite(n.remain_resin_discount_num),weeklyDiscountLimit:finite(n.resin_discount_num_limit),expeditions:Array.isArray(n.expeditions)?n.expeditions.map(e=>({status:label(e.status),remainingSeconds:Number(e.remained_time)||0})):null}:null;
 const hasInventory=raw.inventory?.has_user_info===true&&Array.isArray(raw.inventory.available_material);
 const inventory=hasInventory?{syncedAt:at,source:'米游社养成计算器',coverage:'本次养成计算可抵扣数量；≥表示仅确认下限，并非完整背包'+(raw.inventory.completedBatches<raw.inventory.totalBatches?'（部分批次成功）':''),items:raw.inventory.available_material.filter(m=>Number.isInteger(m.id)&&Number.isFinite(m.num)).map(m=>({id:m.id,name:label(m.name),count:m.num,minimum:m.minimum===true}))}:null;
 const d=raw.syncDiagnostics,syncDiagnostics=d?.strategy==='seelieex-adapted'&&Number.isInteger(d.gameApiRequests)&&d.gameApiRequests>=0&&Number.isInteger(d.reusedCalculatorDetails)&&d.reusedCalculatorDetails>=0?{strategy:'seelieex-adapted',gameApiRequests:d.gameApiRequests,reusedCalculatorDetails:d.reusedCalculatorDetails}:null;
 return {schemaVersion:1,checkedAt:at,role:{uid:String(role.game_uid??''),nickname:label(role.nickname),region:label(role.region),regionName:label(role.region_name),level:finite(Number(role.level))},roles:(raw.roles??[]).map(r=>({uid:String(r.game_uid),nickname:label(r.nickname),region:label(r.region),regionName:label(r.region_name)})),notes,characters,inventory,syncDiagnostics,errors:raw.errors??{},verificationRequired:Object.values(raw.errors??{}).some(e=>[1034,10034,10035,5003,10041].includes(e.code))};
}
export function mergeAccount(previous,next){
 if(!previous||previous.role?.uid!==next.role.uid||previous.role?.region!==next.role.region)return next;
 let characters=next.characters??previous.characters;
 if(next.characters&&previous.characters){const rows=new Map(previous.characters.items.map(c=>[c.id,{...c,syncedAt:c.syncedAt??previous.characters.syncedAt}]));for(const c of next.characters.items){const old=rows.get(c.id);rows.set(c.id,{...old,...c,skillsSyncedAt:c.skillsSyncedAt??old?.skillsSyncedAt??old?.syncedAt,artifactsSyncedAt:c.artifactsSyncedAt??old?.artifactsSyncedAt??old?.syncedAt,weaponSyncedAt:c.weaponSyncedAt??old?.weaponSyncedAt??old?.syncedAt,weapon:c.weapon?{...c.weapon,refinement:c.weapon.refinement??old?.weapon?.refinement}:old?.weapon??null,skills:c.skills??old?.skills??null,artifacts:c.artifacts?.map(a=>({...a,setName:a.setName||(old?.artifacts?.find(p=>p.pos===a.pos&&p.name===a.name)?.setName??'')}))??old?.artifacts??null});}characters={...next.characters,items:[...rows.values()]};}
 return {...next,notes:next.notes??previous.notes,characters,inventory:next.inventory??previous.inventory};
}
export function applyAccount(state,snapshot,catalog,{forceResources=false}={}){
 const next=structuredClone(state),sameAccount=!next.profile.uid||next.profile.uid===snapshot.role.uid;
 if(!sameAccount)throw new Error('同步账号与当前规划 UID 不同，请先切换规划账号，避免串号覆盖');
 if(Number.isInteger(snapshot.role.level)&&snapshot.role.level>=1&&snapshot.role.level<=60)next.profile.adventureRank=snapshot.role.level;next.profile.uid=snapshot.role.uid;next.profile.name=snapshot.role.nickname||next.profile.name;
 const notes=snapshot.notes,notesAt=Date.parse(notes?.syncedAt);
 if(Number.isInteger(notes?.resin)&&notes.resin>=0&&notes.resin<=200&&Number.isFinite(notesAt)&&(forceResources||!(Date.parse(next.profile.snapshot)>notesAt))){next.profile.resin=notes.resin;next.profile.snapshot=notes.syncedAt;}
 next.economy??={};next.economy.resourceTimes??={};
 function resource(key,value,at,max=1e9){if(Number.isInteger(value)&&value>=0&&value<=max&&Number.isFinite(Date.parse(at))&&(forceResources||!(Date.parse(next.economy.resourceTimes[key])>=Date.parse(at)))){next.economy[key]=value;next.economy.resourceTimes[key]=at;}}
 // dailyNote reports the uncollected jar, not currency already in the wallet.
 resource('jar',notes?.homeCoin,notes?.syncedAt,2400);
 resource('coinCap',notes?.maxHomeCoin,notes?.syncedAt,2400);
 // Only exact material names are matched. Grade-equivalent or manually combined goals stay manual.
 const inventory=new Map((snapshot.inventory?.items??[]).map(m=>[m.id,m]));
 const freshInventory=snapshot.inventory&&!(Date.parse(next.materialInventory?.syncedAt)>=Date.parse(snapshot.inventory.syncedAt));
 if(freshInventory){
  const pools=new Map([...inventory.values()].map(m=>[m.name||catalog?.materials?.[m.id]?.name,m.count]));
  const books=[...inventory.values()].filter(m=>[104001,104002,104003].includes(m.id));
  if(books.length)pools.set('角色经验',books.reduce((n,m)=>n+m.count*({104001:1000,104002:5000,104003:20000}[m.id]),0));
  for(const goal of [...next.goals].sort((a,b)=>b.priority-a.priority))if(pools.has(goal.material)){const amount=Math.min(goal.need??Infinity,pools.get(goal.material));goal.owned=amount;goal.stockKnown=true;pools.set(goal.material,pools.get(goal.material)-amount);}
 }
 for(const [name,key,max]of [['摩拉','mora',1e9],['晶核','cores',1e9],['浓缩树脂','condensed',5],['洞天宝钱','coins',1e9]]){const item=[...inventory.values()].find(m=>(m.name||catalog?.materials?.[m.id]?.name)===name);if(item&&!item.minimum)resource(key,item.count,snapshot.inventory.syncedAt,max);}
 if(snapshot.characters){next.equippedWeapons=snapshot.characters.items.filter(c=>c.weapon?.id).map(c=>({...c.weapon,key:String(c.id)+'-'+String(c.weapon.id),holder:c.name,holderId:c.id,syncedAt:c.weaponSyncedAt??c.syncedAt??snapshot.characters.syncedAt}));}
 if(freshInventory){next.materialInventory={syncedAt:snapshot.inventory.syncedAt,items:snapshot.inventory.items.map(m=>({id:m.id,count:m.count,minimum:m.minimum===true}))};}
 let result=next;
 for(const c of snapshot.characters?.items??[]){
  const traveler=[10000005,10000007].includes(c.id),element=travelerElement(c.element);
  const entry=traveler?(element?catalog?.travelerForms?.find(f=>f.key==='traveler'+element):null):catalog?.characters?.find(v=>v.id===c.id);
  // Even when the active element is missing, shared level/ascension are usable.
  const key=entry?.key??(traveler?'traveleranemo':null);if(!key)continue;
  const itemAt=c.syncedAt??snapshot.characters.syncedAt,artifactAt=c.artifactsSyncedAt??itemAt;
  if(Array.isArray(c.artifacts)){const owner=traveler?'traveler':key;result.artifactLoadouts??={};if(!(Date.parse(result.artifactLoadouts[owner]?.syncedAt)>Date.parse(artifactAt)))result.artifactLoadouts[owner]={complete:true,syncedAt:artifactAt,items:structuredClone(c.artifacts)};}
  const old=characterRecord(result,key),talents=[...old.talents],at=Date.parse(itemAt);
  if(Date.parse(old.syncedAt)>at||traveler&&Date.parse(old.sharedAt)>at)continue;
  // Calculator proud-skill groups identify the three upgradeable talent slots.
  if(entry&&!(Date.parse(old.syncedAt)>Date.parse(c.skillsSyncedAt??itemAt)))for(const skill of c.skills??[]){const slot=Number.isInteger(skill.slot)?skill.slot:[1,2,3].includes(skill.type)?skill.type-1:null;if(slot!==null&&slot>=0&&slot<=2&&Number.isInteger(skill.baseLevel)&&skill.baseLevel>=1&&skill.baseLevel<=10)talents[slot]=skill.baseLevel;}
  result=saveCharacterRecord(result,key,{...old,level:c.level??old.level,ascension:c.ascension??ascensionFromLevel(c.level)??old.ascension,talents,source:c.source??'米游社官方接口',syncedAt:itemAt});
 }
 return result;
}

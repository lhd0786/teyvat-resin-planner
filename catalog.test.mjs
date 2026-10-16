import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {aggregateCosts,levelExperience,materialRoute,artifactUpgradeCost,addTrainingRequest,removeTrainingTarget,migrateLegacyLevelTargets,refreshTrainingTargets,experienceResources,setCharacterTarget,setWeaponTarget,levelTargetOptions} from './catalog.js';
import {validate,plan,gameDate,weekKey} from './planner.js';
test('经验资源先大后小，仅末档向上取整，合计足够且不重复进位',()=>{
 assert.deepEqual(experienceResources('角色经验',3423125).map(r=>[r.name,r.count]),[['大英雄的经验',171],['流浪者的经验',4]]);
 assert.deepEqual(experienceResources('角色经验',25001).map(r=>r.count),[1,1,1]);
 assert.deepEqual(experienceResources('圣遗物经验',674850).map(r=>[r.name,r.count]),[['祝圣精华',67],['祝圣油膏',2]]);
 assert.deepEqual(experienceResources('圣遗物经验',10000).map(r=>r.count),[1]);
 assert.deepEqual(experienceResources('角色经验',0),[]);
 for(const type of ['角色经验','圣遗物经验'])for(const amount of [1,999,1001,2499,2500,9999,20001,674850]){const rows=experienceResources(type,amount),total=rows.reduce((n,r)=>n+r.count*r.value,0);assert.ok(total>=amount);assert.ok(total-amount<(type==='角色经验'?1000:2500));}
});
const db=JSON.parse(await readFile(new URL('data/catalog.json',import.meta.url),'utf8'));
test('每个上游条目与阶段都存在，所有材料引用可解析',()=>{
 for(const kind of ['characters','weapons','talents']){assert.equal(db[kind].length,db.meta.counts[kind]);assert.equal(new Set(db[kind].map(v=>v.key)).size,db[kind].length);for(const item of db[kind]){assert.ok(Object.keys(item.costs).length>=4);for(const rows of Object.values(item.costs))for(const row of rows){assert.ok(db.materials[row.id]);assert.ok(row.count===null||Number.isInteger(row.count)&&row.count>=0);}}}
});
test('那维莱特完整突破材料的确定性总计',()=>{
 const c=db.characters.find(v=>v.key==='neuvillette'),rows=aggregateCosts(c,0,6),get=id=>rows.find(r=>r.id===id).count;
 assert.equal(get(113053),46);assert.equal(get(101237),168);assert.equal(get(202),420000);assert.equal(get(112080),18);assert.equal(get(112081),30);assert.equal(get(112082),36);
});
test('单项天赋 1 到 10 与部分升级区间不混淆',()=>{
 const t=db.talents.find(v=>v.key==='neuvillette'),full=aggregateCosts(t,1,10),part=aggregateCosts(t,8,10);
 assert.equal(full.find(r=>r.id===104340).count,38);assert.equal(full.find(r=>r.id===113048).count,6);assert.equal(full.find(r=>r.id===104319).count,1);assert.equal(part.find(r=>r.id===104340).count,28);
});
test('低星武器上限以及上游未知消耗保留未知',()=>{
 const w=db.weapons.find(v=>v.key==='dullblade');assert.throws(()=>aggregateCosts(w,0,6));assert.equal(Object.keys(w.costs).length,4);
 const c=db.characters.find(v=>v.key==='manekin');assert.equal(aggregateCosts(c,0,6).find(r=>r.id===202).count,null);
});
test('经验表按星级与等级区间正确累计',()=>{
 assert.equal(levelExperience(db,'characters',5,1,90),8362650);assert.equal(levelExperience(db,'characters',5,80,90),3423125);assert.equal(levelExperience(db,'weapons',5,1,2),600);assert.equal(levelExperience(db,'weapons',4,1,2),400);assert.throws(()=>levelExperience(db,'weapons',1,1,90));
});
test('开放日匹配材料，采集和宝石副产物不单独派树脂',()=>{
 assert.deepEqual(materialRoute(db.materials[104338]).days,[1,4,0]);assert.equal(materialRoute(db.materials[114053]).location,'深潮的余响');assert.equal(materialRoute(db.materials[113048]).type,'weekly');assert.equal(materialRoute(db.materials[101237]),null);assert.equal(materialRoute(db.materials[104121]),null);
});
test('旅行者七元素各自匹配天赋表，并共用突破进度键',()=>{
 assert.equal(db.travelerForms.length,7);assert.equal(new Set(db.travelerForms.map(f=>f.element)).size,7);
 for(const form of db.travelerForms){assert.ok(db.talents.some(t=>t.key===form.talentKey));assert.equal(form.sharedProgressKey,'traveler');assert.deepEqual(form.costs,db.characters.find(c=>c.key==='aether').costs);}
});

function trainingState(){return {schemaVersion:1,profile:{name:'测试',uid:'',resin:200,snapshot:new Date().toISOString(),week:weekKey(gameDate()),weeklyClaims:0,claimedBosses:[]},goals:[]};}
function currentTargetState(){const s=trainingState();s.characterRecords={varesa:{level:80,ascension:5,talents:[6,7,8],source:'接口',syncedAt:null}};return s;}
test('完整角色目标替换而非追加，低天赋目标归当前值，圣遗物可取消且不会重新自动插入',()=>{
 let s=setCharacterTarget(currentTargetState(),db,{itemKey:'varesa',level:90,ascension:6,talents:[1,9,8]});assert.equal(s.trainingRequests.length,6);assert.equal(new Set(s.trainingRequests.map(r=>r.itemKey)).size,1);assert.equal(s.trainingRequests.find(r=>r.kind==='talents'&&r.slot===0).to,6);
 s=setCharacterTarget(s,db,{itemKey:'varesa',level:80,ascension:5,talents:[6,7,8],artifacts:false});assert.equal(s.trainingRequests.length,5);assert.ok(!s.trainingRequests.some(r=>r.kind==='artifacts'));assert.ok(s.trainingRequests.every(r=>r.rows.length===0));assert.equal(s.goals.length,0);assert.equal(validate(s).trainingRequests.length,5);
 s=setCharacterTarget(s,db,{itemKey:'varesa',level:80,ascension:5,talents:[6,7,8]});assert.equal(s.trainingRequests.filter(r=>r.kind==='artifacts').length,1);
 const duplicate=structuredClone(s);duplicate.trainingRequests.push({...duplicate.trainingRequests[0],id:'different-id'});assert.throws(()=>validate(duplicate),/不能重复/);
});
test('边界等级先列未突破，已突破显式选择；已完成当前值不能倒退',()=>{
 const rows=levelTargetOptions();assert.deepEqual(rows.filter(r=>r.level===80).map(r=>r.value),['80:5','80:6']);assert.deepEqual(levelTargetOptions(70).filter(r=>r.level===70).map(r=>r.value),['70:4']);assert.throws(()=>setCharacterTarget(currentTargetState(),db,{itemKey:'varesa',level:79,ascension:5,talents:[6,7,8]}));
 let s=setCharacterTarget(currentTargetState(),db,{itemKey:'varesa',level:80,ascension:5,talents:[6,7,8],artifacts:false});s.characterRecords.varesa={...s.characterRecords.varesa,level:90,ascension:6,talents:[10,10,10]};s=refreshTrainingTargets(s,db);assert.ok(s.trainingRequests.every(r=>r.from===r.to));assert.deepEqual(s.trainingRequests.filter(r=>r.kind==='talents').map(r=>r.to),[10,10,10]);
});
test('武器等级与突破独立于角色汇总，重复保存只替换对应武器目标',()=>{
 let s=setCharacterTarget(currentTargetState(),db,{itemKey:'varesa',level:80,ascension:5,talents:[6,7,8],artifacts:false});const w=db.weapons.find(w=>w.key==='favoniussword');s.equippedWeapons=[{id:w.id,key:'10000111-'+w.id,holder:'瓦雷莎',level:20,ascension:0,refinement:1,syncedAt:null}];
 s=setWeaponTarget(s,db,{itemKey:w.key,level:20,ascension:1});s=setWeaponTarget(s,db,{itemKey:w.key,level:20,ascension:1});assert.equal(s.trainingRequests.filter(r=>r.itemKey===w.key).length,2);assert.equal(s.trainingRequests.filter(r=>r.itemKey==='varesa').length,5);assert.ok(s.trainingRequests.filter(r=>r.itemKey===w.key).every(r=>['weapons','weaponLevel'].includes(r.kind)));assert.ok(validate(s));
});
test('旅行者共享升级子项目只属于一个元素目标，不生成独立共用目标或重复材料',()=>{
 const s=trainingState();s.characterRecords={traveleranemo:{level:80,ascension:5,talents:[1,1,1]},travelergeo:{level:80,ascension:5,talents:[1,1,1]}};let next=setCharacterTarget(s,db,{itemKey:'traveleranemo',level:80,ascension:5,talents:[1,1,1]});next=setCharacterTarget(next,db,{itemKey:'travelergeo',level:80,ascension:5,talents:[1,1,1]});assert.equal(next.trainingRequests.filter(r=>r.kind==='characterLevel').length,1);assert.equal(next.trainingRequests.filter(r=>r.kind==='artifacts').length,1);assert.ok(!next.trainingRequests.some(r=>r.itemKey==='traveler'));assert.equal(new Set(next.trainingRequests.map(r=>r.id)).size,next.trainingRequests.length);
});
test('角色升级、突破、三项天赋属于同一角色，摩拉与天赋材料合并且重复添加替换',()=>{
 let s=addTrainingRequest(trainingState(),db,{kind:'characterLevel',itemKey:'neuvillette',from:80,to:90});
 s=addTrainingRequest(s,db,{kind:'characters',itemKey:'neuvillette',from:5,to:6});for(let slot=0;slot<3;slot++)s=addTrainingRequest(s,db,{kind:'talents',itemKey:'neuvillette',slot,from:8,to:10});
 const keyCount=new Set(s.trainingRequests.map(r=>r.itemKey));assert.equal(keyCount.size,1);assert.equal(s.trainingRequests.length,6);assert.equal(s.goals.filter(g=>g.material==='摩拉').length,1);assert.ok(s.goals.some(g=>g.type==='supply'&&g.material==='智识之冕'));
 const before=s.goals.find(g=>g.material==='摩拉').need;s=addTrainingRequest(s,db,{kind:'talents',itemKey:'neuvillette',slot:0,from:8,to:10});assert.equal(s.goals.find(g=>g.material==='摩拉').need,before);assert.equal(validate(s).trainingRequests.length,6);
 const removed=removeTrainingTarget(s,db,'neuvillette');assert.equal(removed.trainingRequests.length,0);assert.equal(removed.goals.length,0);
});
test('未知库存保留提示且不自动刷取，已知库存跨角色只抵扣一次',()=>{
 let s=addTrainingRequest(trainingState(),db,{kind:'talents',itemKey:'neuvillette',slot:1,from:1,to:2});assert.ok(s.goals.every(g=>g.stockKnown===false));assert.equal(plan(s,{horizon:1})[0].tasks.length,0);
 const x=trainingState();x.materialInventory={syncedAt:new Date().toISOString(),items:[{id:202,count:20000}]};s=addTrainingRequest(x,db,{kind:'talents',itemKey:'neuvillette',slot:1,from:1,to:2});s=addTrainingRequest(s,db,{kind:'talents',itemKey:'fischl',slot:2,from:1,to:2});const mora=s.goals.find(g=>g.material==='摩拉');assert.equal(mora.need,25000);assert.equal(mora.owned,20000);assert.equal(s.goals.filter(g=>g.material==='摩拉').length,1);
});
test('圣遗物按当前等级零经验计算，忽略级内经验，未装备与未知区分',()=>{
 const gear=Array.from({length:5},(_,i)=>({pos:i+1,rarity:5,level:0,levelExp:null}));let cost=artifactUpgradeCost(db,gear);assert.equal(cost.known,true);assert.equal(cost.exp,270475*5);assert.equal(cost.mora,cost.exp);
 gear[0].level=20;gear[1].level=19;gear[1].levelExp=1000;cost=artifactUpgradeCost(db,gear);assert.equal(cost.exp,270475*3+35575);assert.equal(cost.mora,cost.exp);
 assert.equal(artifactUpgradeCost(db,null).known,false);assert.equal(artifactUpgradeCost(db,[]).known,false);assert.equal(artifactUpgradeCost(db,[],{complete:true}).exp,0);assert.equal(artifactUpgradeCost(db,[],{complete:true}).known,true);
 assert.equal(artifactUpgradeCost(db,[{pos:1,rarity:4,level:0}],{complete:true}).exp,122675);
});
test('圣遗物费用自动并入角色目标，缺配装不以零费用代替',()=>{
 let s=trainingState();s.artifactLoadouts={neuvillette:{complete:true,items:Array.from({length:5},(_,i)=>({pos:i+1,rarity:5,level:19,levelExp:null})),syncedAt:null}};
 s=addTrainingRequest(s,db,{kind:'characterLevel',itemKey:'neuvillette',from:80,to:90});assert.equal(s.goals.find(g=>g.material==='摩拉').need,684625+35575*5);assert.equal(s.goals.find(g=>g.material==='圣遗物经验').need,35575*5);assert.equal(s.trainingRequests.find(r=>r.kind==='artifacts').pending,false);assert.ok(validate(s).artifactLoadouts.neuvillette.complete);
 s=addTrainingRequest(trainingState(),db,{kind:'characterLevel',itemKey:'neuvillette',from:80,to:90});assert.equal(s.trainingRequests.find(r=>r.kind==='artifacts').pending,true);
});
test('旧版分列经验和摩拉迁移成一个角色升级项目',()=>{
 const s=trainingState();s.goals=[{id:'growth-characters-varesa-mora',name:'瓦雷莎 · Lv.80→90 · 摩拉'},{id:'growth-characters-varesa-exp',name:'瓦雷莎 · Lv.80→90 · 角色经验'}];const next=migrateLegacyLevelTargets(s,db);assert.equal(next.trainingRequests.filter(r=>r.kind==='characterLevel').length,1);assert.equal(next.goals.some(g=>g.id.startsWith('growth-')),false);assert.equal(new Set(next.trainingRequests.map(r=>r.itemKey)).size,1);
});


test('账号等级和配装更新后，统一目标重新计算剩余消耗',()=>{
 let s=trainingState();s=addTrainingRequest(s,db,{kind:'characterLevel',itemKey:'neuvillette',from:80,to:90});s.characterRecords={neuvillette:{level:89,ascension:6,talents:[null,null,null],syncedAt:null,source:'手动记录'}};s.artifactLoadouts={neuvillette:{complete:true,syncedAt:null,items:Array.from({length:5},(_,i)=>({pos:i+1,rarity:5,level:20,levelExp:null}))}};
 const next=refreshTrainingTargets(s,db);assert.equal(next.trainingRequests.find(r=>r.kind==='characterLevel').from,89);assert.equal(next.trainingRequests.find(r=>r.kind==='artifacts').pending,false);assert.equal(next.goals.find(g=>g.material==='摩拉').need,Math.ceil(levelExperience(db,'characters',5,89,90)/5));assert.ok(!next.goals.some(g=>g.material==='圣遗物经验'));assert.ok(validate(next));
});

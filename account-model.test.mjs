import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAccount,mergeAccount,applyAccount,characterRecord,saveCharacterRecord,accountCharacterRows,catalogProgress,ascensionFromLevel,requestedCharacterIds,characterSyncNeeded} from './account-model.js';
import {readFileSync} from 'node:fs';
import {validate,emptyTraveler} from './planner.js';
const catalog=JSON.parse(readFileSync(new URL('./data/catalog.json',import.meta.url),'utf8'));
const raw=()=>({syncedAt:'2026-10-15T14:00:00Z',role:{game_uid:'123456789',nickname:'旅人',region:'cn_gf01'},roles:[],errors:{}});
test('切换至未建目标的角色也进入定向读取范围，不遍历整个账号',()=>{
 const s={trainingRequests:[{kind:'characterLevel',itemKey:'varesa'}]};assert.deepEqual(requestedCharacterIds(s,catalog,'aino').sort(),[10000111,10000121]);assert.deepEqual(requestedCharacterIds(s,catalog,'varesa'),[10000111]);assert.equal(requestedCharacterIds(s,catalog,null).length,1);
});
test('只有完整且近期成功的详情可作为当前值缓存；基础信息与缺天赋仍需读取',()=>{
 const at='2026-10-16T07:00:00Z',state={characterRecords:{aino:{level:90,ascension:6,talents:[1,1,null],source:'米游社官方接口',syncedAt:at}},artifactLoadouts:{aino:{complete:true,items:[]}}},now=Date.parse(at)+1000;
 assert.equal(characterSyncNeeded(state,'aino',{now}),true);state.characterRecords.aino={...state.characterRecords.aino,talents:[1,1,7],source:'米游社养成计算器'};assert.equal(characterSyncNeeded(state,'aino',{now}),false);assert.equal(characterSyncNeeded(state,'aino',{now:now+300001}),true);assert.equal(characterSyncNeeded(state,'varesa',{now}),true);
});
test('战绩被拦截时使用定向计算器详情同步等级、明确突破、三个天赋和圣遗物',()=>{
 const r={...raw(),errors:{details:{code:1034}},calculatorCharacters:{list:[{id:10000111,name:'瓦雷莎',level_current:80,promote_level:5,avatar_level:5,element_attr_id:5,skill_list:[{id:11111,group_id:11131,level_current:1,max_level:10},{id:11112,group_id:11132,level_current:7,max_level:10},{id:11115,group_id:11139,level_current:9,max_level:10},{id:11121,group_id:11121,level_current:0,max_level:1}],reliquary_list:[{id:3954,name:'执灯人的誓词',reliquary_cat_id:1,reliquary_level:5,level_current:20}],weapon:{id:14502,name:'四风原典',level_current:90,weapon_level:5}}]}};
 const snap=normalizeAccount(r);assert.equal(snap.characters.items[0].ascension,5);assert.equal(snap.characters.items[0].skills.length,3);const next=applyAccount({profile:{uid:'123456789'},goals:[]},snap,catalog);assert.deepEqual(characterRecord(next,'varesa').talents,[1,7,9]);assert.equal(characterRecord(next,'varesa').level,80);assert.equal(next.artifactLoadouts.varesa.items[0].level,20);assert.equal(next.equippedWeapons[0].level,90);
});
test('定向更新保留其他角色与旧时间，基础列表不把旧天赋伪装成新数据',()=>{
 const previous=normalizeAccount({...raw(),characters:{list:[{id:10000111,name:'瓦雷莎',level:80,promote_level:5,skills:[{skill_id:1,skill_type:1,base_level:1,level:1}]},{id:10000003,name:'琴',level:70}]}});
 const fresh=normalizeAccount({...raw(),syncedAt:'2026-10-15T16:00:00Z',calculatorCharacters:{list:[{id:10000111,name:'瓦雷莎',level_current:90,promote_level:6}]}}),merged=mergeAccount(previous,fresh);assert.equal(merged.characters.items.length,2);assert.equal(merged.characters.items.find(c=>c.id===10000003).syncedAt,previous.checkedAt);assert.equal(merged.characters.items.find(c=>c.id===10000111).skillsSyncedAt,previous.checkedAt);
 const state={profile:{uid:'123456789'},goals:[],characterRecords:{varesa:{level:80,ascension:5,talents:[8,8,8],syncedAt:'2026-10-15T15:00:00Z'}}},next=applyAccount(state,merged,catalog);assert.equal(next.characterRecords.varesa.level,90);assert.deepEqual(next.characterRecords.varesa.talents,[8,8,8]);
});
test('缺失树脂、角色和库存保留未知，不伪造为零',()=>{const data=normalizeAccount(raw());assert.equal(data.notes,null);assert.equal(data.characters,null);assert.equal(data.inventory,null);});
test('读取失败保留原快照时间，切换 UID 不复用旧资源',()=>{const old=normalizeAccount({...raw(),notes:{current_resin:160,max_resin:200}}),next=normalizeAccount({...raw(),syncedAt:'2026-10-15T15:00:00Z',errors:{notes:{code:1034}}});const merged=mergeAccount(old,next);assert.equal(merged.notes.resin,160);assert.equal(merged.notes.syncedAt,old.notes.syncedAt);assert.equal(merged.verificationRequired,true);next.role.uid='987654321';assert.equal(mergeAccount(old,next).notes,null);});
test('归一化只保留游戏数据，不包含额外凭据字段',()=>{const r={...raw(),password:'not-exported',cookie:'not-exported',notes:{current_resin:120,token:'not-exported'},characters:{list:[{id:1,name:'角色',level:80,password:'not-exported',weapon:{id:2,name:'武器',level:90,affix_level:1}}]}};assert.ok(!JSON.stringify(normalizeAccount(r)).includes('not-exported'));});
test('计算器必须确认账号数据可用，库存零与缺失可区分',()=>{const r={...raw(),inventory:{has_user_info:false,available_material:[{id:1,num:0,name:'材料'}]}};assert.equal(normalizeAccount(r).inventory,null);r.inventory.has_user_info=true;assert.equal(normalizeAccount(r).inventory.items[0].count,0);});
test('仅精确材料匹配抵扣库存，未知保留手工值',()=>{const state={profile:{uid:'123456789',name:'旧',resin:80,snapshot:'old'},goals:[{material:'材料',owned:7},{material:'合成等价材料',owned:8}]};const snap=normalizeAccount({...raw(),inventory:{has_user_info:true,available_material:[{id:1,name:'材料',num:0}]}});const result=applyAccount(state,snap,{materials:{1:{id:1,name:'材料'}}});assert.equal(result.goals[0].owned,0);assert.equal(result.goals[1].owned,8);assert.equal(result.profile.resin,80);assert.equal(state.goals[0].owned,7);snap.role.uid='987654321';assert.throws(()=>applyAccount(state,snap,{}));});

test('旅行者按普通角色读取七元素，仅当前元素读取天赋，共用等级不覆盖其他元素天赋',()=>{
 const state={profile:{uid:'123456789'},goals:[],traveler:emptyTraveler()};state.traveler.talents.geo=[6,7,8];
 const snap=normalizeAccount({...raw(),characters:{list:[{id:10000007,name:'荧',element:'Anemo',level:80,promote_level:5,skills:[{skill_id:1,name:'技能',skill_type:2,level:12,base_level:9}]}]}});
 const next=applyAccount(state,snap,catalog),rows=accountCharacterRows(snap,catalog,next);
 assert.equal(rows.length,7);assert.ok(rows.every(r=>r.key.startsWith('traveler')));
 assert.deepEqual(characterRecord(next,'traveleranemo').talents,[null,9,null]);assert.deepEqual(characterRecord(next,'travelergeo').talents,[6,7,8]);
 assert.ok(rows.every(r=>r.level===80&&r.ascension===5));assert.equal(rows.filter(r=>r.skills).length,1);assert.equal(characterRecord(next,'travelercryo').talents[1],null);
 const edited=saveCharacterRecord(next,'travelergeo',{level:90,ascension:6,talents:[8,9,10],source:'手动记录',syncedAt:null});assert.equal(characterRecord(edited,'traveleranemo').level,90);assert.equal(characterRecord(edited,'traveleranemo').talents[1],9);assert.equal(state.traveler.level,null);
});

test('普通角色和七元素记录支持校验、备份及旧数据迁移',()=>{
 const state={schemaVersion:1,profile:{name:'旅人',uid:'',resin:0,snapshot:new Date().toISOString(),weeklyClaims:0,claimedBosses:[],week:'2026-10-12'},goals:[],traveler:emptyTraveler()};state.traveler.talents.hydro=[1,4,5];
 const old=validate(state);assert.deepEqual(old.characterRecords.travelerhydro.talents,[1,4,5]);
 const saved=saveCharacterRecord(old,'neuvillette',{level:80,ascension:6,talents:[9,6,6],source:'手动记录',syncedAt:null});
 assert.equal(validate(JSON.parse(JSON.stringify(saved))).characterRecords.neuvillette.level,80);
 saved.characterRecords.neuvillette.talents[0]=99;assert.throws(()=>validate(saved));
});
test('新版详情base结构与已装备武器正常映射，同名武器实例不合并',()=>{
 const r={...raw(),characters:{list:[{id:1,name:'甲',level:80},{id:2,name:'乙',level:90}]},details:{list:[{base:{id:1,name:'甲',level:80},weapon:{id:11101,name:'无锋剑',level:20,promote_level:1,affix_level:1}},{base:{id:2,name:'乙',level:90},weapon:{id:11101,name:'无锋剑',level:60,promote_level:3,affix_level:5}}]}};
 const snap=normalizeAccount(r);assert.equal(snap.characters.items[0].weapon.ascension,1);const s=applyAccount({profile:{uid:'123456789'},goals:[]},snap,catalog);assert.equal(s.equippedWeapons.length,2);
 assert.equal(catalogProgress(s,'weapons',{id:11101},'2-11101').level,60);assert.equal(catalogProgress(s,'weapons',{id:11101},'1-11101').ascension,1);
 assert.equal(ascensionFromLevel(90),6);assert.equal(ascensionFromLevel(80),null);assert.equal(ascensionFromLevel(79),5);
});
test('重复应用旧快照不覆盖手工更新，公共库存只分配一次',()=>{
 const snap=normalizeAccount({...raw(),notes:{current_resin:160},inventory:{has_user_info:true,available_material:[{id:202,name:'摩拉',num:100}]}});
 let s={profile:{uid:'123456789',resin:20,snapshot:'2026-10-15T15:00:00Z'},goals:[{material:'摩拉',need:80,owned:0,priority:5},{material:'摩拉',need:80,owned:0,priority:3}]};s=applyAccount(s,snap,catalog);assert.equal(s.profile.resin,20);assert.deepEqual(s.goals.map(g=>g.owned),[80,20]);s.goals[1].owned=30;assert.equal(applyAccount(s,snap,catalog).goals[1].owned,30);
});
test('新版详情读取圣遗物并保持突破边界未知，非边界等级可确认阶段',()=>{
 const c=catalog.characters.find(c=>c.key==='varesa');const r={...raw(),characters:{list:[{id:c.id,name:c.name,level:80}]},details:{list:[{base:{id:c.id,level:80},relics:[{id:1,pos:1,name:'花',rarity:5,level:16,set:{name:'套装'}}]}]}};let snapshot=normalizeAccount(r);assert.equal(snapshot.characters.items[0].ascension,null);assert.equal(snapshot.characters.items[0].artifacts[0].level,16);
 const next=applyAccount({profile:{uid:'123456789'},goals:[]},snapshot,catalog);assert.equal(next.artifactLoadouts.varesa.complete,true);assert.equal(next.artifactLoadouts.varesa.items[0].setName,'套装');
 r.details.list[0].base.promote_level=6;snapshot=normalizeAccount(r);assert.equal(snapshot.characters.items[0].ascension,6);r.details.list[0].base.level=81;delete r.details.list[0].base.promote_level;assert.equal(normalizeAccount(r).characters.items[0].ascension,6);
});

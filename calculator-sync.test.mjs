import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inventoryBatches,readInventory,inventoryFromResult,readCalculatorCharacters,CALCULATOR} from './calculator-sync.mjs';
test('库存每批最多30项并去重，旅行者不使用缺失元素的错误参数',()=>{const chars=Array.from({length:65},(_,i)=>({id:10000020+i}));chars.push({id:10000005},chars[0]);const batches=inventoryBatches(chars);assert.deepEqual(batches.map(b=>b.length),[30,30,5]);assert.equal(batches[0][0].avatar_promote_level,0);assert.equal(batches[0][0].from_user_sync,false);});
test('库存跨批次按材料ID去重，不把同一钱包余额相加，失败保留成功批次',async()=>{
 let calls=0;const result=await readInventory(async(url,options)=>{assert.equal(url,CALCULATOR+'v3/batch_compute');assert.equal(options.body.uid,'123');if(++calls===3)throw {code:10034};return {has_user_info:true,overall_consume:[{id:202,name:'摩拉',num:600,lack_num:100},{id:104003,name:'大英雄的经验',num:100,lack_num:100}]};},{game_uid:'123',region:'cn_gf01'},Array.from({length:65},(_,i)=>({id:10000020+i})),{prefetchedDetails:[]});
 assert.equal(result.inventory.available_material.length,2);assert.equal(result.inventory.available_material[0].num,500);assert.equal(result.inventory.available_material[1].num,0);assert.equal(result.inventory.completedBatches,2);assert.equal(result.error.code,10034);
});
test('没有账号库存权限的计算结果不能视为库存',async()=>{const r=await readInventory(async()=>({has_user_info:false,available_material:[]}),{game_uid:'123'},[{id:10000111}]);assert.equal(r.inventory,null);assert.equal(r.error.code,'INVENTORY_NOT_AUTHORIZED');});

test('总需求减缺口得到可抵扣数量，空缺口仅代表足够而非完整余额',()=>{assert.deepEqual(inventoryFromResult({has_user_info:true,overall_consume:[{id:202,name:'摩拉',num:100,lack_num:30},{id:1,num:5,lack_num:0}]}).map(m=>[m.num,m.minimum]),[[70,false],[5,true]]);assert.deepEqual(inventoryFromResult({has_user_info:false,overall_consume:[{id:202,num:100,lack_num:30}]}),[]);});

test('同次更新复用新鲜详情，每次更新仍会重新读取库存',async()=>{
 let calls=0;const request=async(url,{body})=>{calls++;assert.equal(url,CALCULATOR+'v3/batch_compute');assert.equal(body.items[0].element_attr_id,6);assert.equal(body.items[0].skill_list[0].id,12101);return {has_user_info:true,overall_consume:[{id:202,num:100,lack_num:100-calls}]};};
 const role={game_uid:'123',region:'cn_gf01'},characters=[{id:10000121}],prefetchedDetails=[{id:10000121,element_attr_id:6,skill_list:[{group_id:12101,max_level:10}]}];
 const a=await readInventory(request,role,characters,{prefetchedDetails}),b=await readInventory(request,role,characters,{prefetchedDetails});
 assert.equal(calls,2);assert.equal(a.inventory.available_material[0].num,1);assert.equal(b.inventory.available_material[0].num,2);
});
test('详情遇验证立即停止，库存不继续请求或递归重试',async()=>{
 let calls=0;const request=async()=>{calls++;throw {code:10034};},role={game_uid:'123',region:'cn_gf01'};
 const details=await readCalculatorCharacters(request,role,[10000121,10000111]);
 const result=await readInventory(request,role,[{id:10000121}],{prefetchedDetails:details.list,detailError:details.error});
 assert.equal(calls,1);assert.equal(result.inventory,null);assert.equal(result.error.code,10034);
});
test('跨批次取最大持有代理值而非相加',async()=>{
 let calls=0;const r=await readInventory(async()=>({has_user_info:true,overall_consume:[{id:202,num:1000,lack_num:++calls===1?600:300}]}),{game_uid:'123'},Array.from({length:31},(_,i)=>({id:10000020+i})),{prefetchedDetails:[]});
 assert.equal(r.inventory.available_material[0].num,700);assert.equal(r.inventory.available_material[0].minimum,false);
});

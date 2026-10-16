import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inventoryBatches,readInventory,inventoryFromResult,CALCULATOR} from './calculator-sync.mjs';
test('库存请求分批且旅行者不使用缺失元素的错误参数',()=>{const chars=Array.from({length:19},(_,i)=>({id:10000020+i}));chars.push({id:10000005});const batches=inventoryBatches(chars);assert.deepEqual(batches.map(b=>b.length),[8,8,3]);assert.equal(batches[0][0].avatar_promote_level,0);assert.equal(batches[0][0].from_user_sync,false);});
test('库存跨批次按材料ID去重，不把同一钱包余额相加，失败保留成功批次',async()=>{
 let calls=0;const result=await readInventory(async(url,options)=>{if(url.endsWith('/sync/avatar/detail'))return {};assert.equal(url,CALCULATOR+'v3/batch_compute');assert.equal(options.body.uid,'123');if(++calls===3)throw {code:10034};return {has_user_info:true,overall_consume:[{id:202,name:'摩拉',num:600,lack_num:100},{id:104003,name:'大英雄的经验',num:100,lack_num:100}]};},{game_uid:'123',region:'cn_gf01'},Array.from({length:19},(_,i)=>({id:10000020+i})));
 assert.equal(result.inventory.available_material.length,2);assert.equal(result.inventory.available_material[0].num,500);assert.equal(result.inventory.available_material[1].num,0);assert.equal(result.inventory.completedBatches,2);assert.equal(result.error.code,10034);
});
test('没有账号库存权限的计算结果不能视为库存',async()=>{const r=await readInventory(async()=>({has_user_info:false,available_material:[]}),{game_uid:'123'},[{id:10000111}]);assert.equal(r.inventory,null);assert.equal(r.error.code,'INVENTORY_NOT_AUTHORIZED');});

test('总需求减缺口得到可抵扣数量，空缺口仅代表足够而非完整余额',()=>{assert.deepEqual(inventoryFromResult({has_user_info:true,overall_consume:[{id:202,name:'摩拉',num:100,lack_num:30},{id:1,num:5,lack_num:0}]}).map(m=>[m.num,m.minimum]),[[70,false],[5,true]]);assert.deepEqual(inventoryFromResult({has_user_info:false,overall_consume:[{id:202,num:100,lack_num:30}]}),[]);});

export const CALCULATOR='https://api-takumi.mihoyo.com/event/e20200928calculate/';
export const CALCULATOR_REFERER='https://webstatic.mihoyo.com/ys/event/e20200923adopt_calculator/index.html';
export function inventoryFromResult(result){
 if(result.has_user_info!==true||!Array.isArray(result.overall_consume))return [];
 return result.overall_consume.filter(m=>Number.isInteger(m.id)&&Number.isFinite(m.num)&&Number.isFinite(m.lack_num)&&m.num>=0&&m.lack_num>=0&&m.lack_num<=m.num).map(m=>({id:m.id,name:m.name,num:m.num-m.lack_num,minimum:m.lack_num===0}));
}
export function inventoryBatches(characters){
 const items=characters.filter(c=>Number.isInteger(c.id)&&![10000005,10000007].includes(c.id)).map(c=>({avatar_id:c.id,avatar_level_current:1,avatar_level_target:90,avatar_promote_level:0,from_user_sync:false,...(c.weapon?.id?{weapon:{id:c.weapon.id,level_current:1,level_target:(c.weapon.rarity??c.weapon.weapon_level)<=2?70:90}}:{}),...(c.skill_list?.length?{skill_list:c.skill_list.filter(s=>s.max_level>1&&Number.isInteger(s.group_id)).map(s=>({id:s.group_id,level_current:1,level_target:Math.min(10,s.max_level)}))}:{})}));
 const batches=[];for(let i=0;i<items.length;i+=8)batches.push(items.slice(i,i+8));return batches;
}
export async function readInventory(request,role,characters){
 const materials=new Map(),enriched=[];let detailError=null;
 for(const c of characters){
  try{const result=await request(CALCULATOR+'v1/sync/avatar/detail',{query:{avatar_id:c.id,uid:String(role.game_uid),region:role.region,lang:'zh-cn'},stage:'calculatorDetails',signed:false});enriched.push({...c,...(result.avatar??result),id:c.id});}
  catch(e){detailError={code:e.code??e.name,stage:'calculatorDetails',message:e.apiMessage??''};enriched.push(c);if([10034,10041].includes(e.code))break;}
 }
 const batches=inventoryBatches(enriched);let completed=0,error=detailError;
 for(const items of batches){
  try{const result=await request(CALCULATOR+'v3/batch_compute',{method:'POST',body:{items,uid:String(role.game_uid),region:role.region,lang:'zh-cn'},stage:'inventory',signed:false,extraHeaders:{Referer:CALCULATOR_REFERER,'x-rpc-cal_type':'0'}});
   if(result.has_user_info!==true||!Array.isArray(result.overall_consume))throw Object.assign(new Error('INVENTORY_NOT_AUTHORIZED'),{code:'INVENTORY_NOT_AUTHORIZED'});
   for(const m of inventoryFromResult(result)){const old=materials.get(m.id);if(!old||old.minimum&&(!m.minimum||m.num>old.num))materials.set(m.id,m);}
   completed++;
  }catch(e){error={code:e.code??e.name,stage:'inventory',message:e.apiMessage??''};break;}
 }
 return {inventory:completed?{has_user_info:true,available_material:[...materials.values()],completedBatches:completed,totalBatches:batches.length}:null,error};
}

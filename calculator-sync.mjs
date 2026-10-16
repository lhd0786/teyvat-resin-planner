export const CALCULATOR='https://api-takumi.mihoyo.com/event/e20200928calculate/';
export const CALCULATOR_REFERER='https://act.mihoyo.com/ys/event/calculator/index.html';
// SeelieEx GI adapter: reuse fresh character data, batch baselines, merge by ID/max.
// Adaptation and upstream revision are recorded in THIRD_PARTY_NOTICES.md.
export const stopsSync=error=>[1034,10034,10035,10041,5003,-100,-101,401,403,429].includes(error?.code);
const apiError=(error,stage)=>({code:error.code??error.name,stage,message:error.apiMessage??''});
export async function readCalculatorCharacters(request,role,ids){
 const list=[];let error=null;
 for(const avatar_id of new Set(ids)){
  try{const result=await request(CALCULATOR+'v1/sync/avatar/detail',{query:{avatar_id,uid:String(role.game_uid),region:role.region,lang:'zh-cn'},stage:'calculatorCharacters',signed:false});
   const avatar=result.avatar??result;if(avatar.id!==avatar_id)throw Object.assign(new Error('INVALID_CHARACTER_RESPONSE'),{code:'INVALID_CHARACTER_RESPONSE'});list.push(avatar);
  }catch(e){error=apiError(e,'calculatorCharacters');if(stopsSync(e))break;}
 }
 return {list,error};
}
export function inventoryFromResult(result){
 if(result.has_user_info!==true||!Array.isArray(result.overall_consume))return [];
 return result.overall_consume.filter(m=>Number.isInteger(m.id)&&Number.isFinite(m.num)&&Number.isFinite(m.lack_num)&&m.num>=0&&m.lack_num>=0&&m.lack_num<=m.num).map(m=>({id:m.id,name:m.name,num:m.num-m.lack_num,minimum:m.lack_num===0}));
}
export function inventoryBatches(characters){
 const unique=new Map(characters.map(c=>[c.id,c]));
 const items=[...unique.values()].filter(c=>Number.isInteger(c.id)&&![10000005,10000007].includes(c.id)).map(c=>({avatar_id:c.id,avatar_level_current:1,avatar_level_target:90,avatar_promote_level:0,from_user_sync:false,...(Number.isInteger(c.element_attr_id)?{element_attr_id:c.element_attr_id}:{}),...(c.weapon?.id?{weapon:{id:c.weapon.id,level_current:1,level_target:(c.weapon.rarity??c.weapon.weapon_level)<=2?70:90}}:{}),...(c.skill_list?.length?{skill_list:c.skill_list.filter(s=>s.max_level>1&&Number.isInteger(s.group_id)).map(s=>({id:s.group_id,level_current:1,level_target:Math.min(10,s.max_level)}))}:{})}));
 const batches=[];for(let i=0;i<items.length;i+=30)batches.push(items.slice(i,i+30));return batches;
}
export async function readInventory(request,role,characters,{prefetchedDetails,detailError=null}={}){
 // prefetchedDetails belongs to this refresh only; never reuse a previous inventory snapshot.
 const details=prefetchedDetails===undefined?await readCalculatorCharacters(request,role,characters.map(c=>c.id)):{list:prefetchedDetails,error:detailError};
 if(stopsSync(details.error))return {inventory:null,error:details.error};
 const fresh=new Map(details.list.map(c=>[c.id,c])),enriched=characters.map(c=>({...c,...fresh.get(c.id),id:c.id})),materials=new Map();
 const batches=inventoryBatches(enriched);let completed=0,error=details.error;
 for(const items of batches){
  try{const result=await request(CALCULATOR+'v3/batch_compute',{method:'POST',body:{items,uid:String(role.game_uid),region:role.region,lang:'zh-cn'},stage:'inventory',signed:false,extraHeaders:{Referer:CALCULATOR_REFERER,'x-rpc-cal_type':'0'}});
   if(result.has_user_info!==true||!Array.isArray(result.overall_consume))throw Object.assign(new Error('INVENTORY_NOT_AUTHORIZED'),{code:'INVENTORY_NOT_AUTHORIZED'});
   for(const m of inventoryFromResult(result)){const old=materials.get(m.id);if(!old||m.num>old.num||m.num===old.num&&old.minimum&&!m.minimum)materials.set(m.id,m);}
   completed++;
  }catch(e){error=apiError(e,'inventory');break;}
 }
 return {inventory:completed?{has_user_info:true,available_material:[...materials.values()],completedBatches:completed,totalBatches:batches.length}:null,error};
}

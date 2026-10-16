import {catalogProgress} from './account-model.js';
// Use whole large resources first, then round only the smallest remainder up.
export function experienceResources(material,experience){
 const units=material==='角色经验'?[['大英雄的经验',20000],['冒险家的经验',5000],['流浪者的经验',1000]]:material==='圣遗物经验'?[['祝圣精华',10000],['祝圣油膏',2500]]:null;
 if(!units||!Number.isFinite(experience)||experience<0)return [];
 let remaining=experience;return units.map(([name,value],i)=>{const count=i===units.length-1?Math.ceil(remaining/value):Math.floor(remaining/value);remaining=Math.max(0,remaining-count*value);return {name,count,value};}).filter(r=>r.count>0);
}
export function experienceResourceText(material,experience){const rows=experienceResources(material,experience);return rows.length?'（等价 '+rows.map(r=>r.name+' × '+r.count.toLocaleString('zh-CN')).join(' + ')+'）':'';}
export function aggregateCosts(item,from,to){
 const talent=Object.keys(item.costs).some(k=>k.startsWith('lvl'));
 const min=talent?1:0,max=talent?10:Object.keys(item.costs).length;
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<min||to>max||from>to)throw new Error('材料计算范围无效');
 const totals=new Map();
 for(let n=from+1;n<=to;n++){
  const rows=item.costs[(talent?'lvl':'ascend')+n];
  if(!rows)throw new Error('该阶段缺少上游数据，不能视为零消耗');
  for(const row of rows){const prev=totals.get(row.id);totals.set(row.id,{id:row.id,count:row.count===null||prev?.count===null?null:(prev?.count??0)+row.count});}
 }
 return [...totals.values()];
}
export function levelExperience(database,kind,rarity,from,to){
 const max=kind==='weapons'&&rarity<=2?70:90;
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to>max||to<from)throw new Error(`经验表仅支持 1–${max} 级`);
 const rows=database.experience[kind],map=new Map(rows);let exp=0;
 for(let n=from;n<to;n++){const row=map.get(n),value=kind==='characters'?row:row?.[rarity-1];if(!Number.isFinite(value))throw new Error('经验数据缺失');exp+=value;}
 return exp;
}
export function materialRoute(material){
 if(material.domain&&material.days.length)return {type:'domain',location:material.domain,days:material.days,yield:1};
 if(material.id===202)return {type:'leyline',location:'藏金之花',days:[0,1,2,3,4,5,6],yield:60000};
 const source=material.sources.find(s=>/挑战奖励|掉落/.test(s))??'';
 if(material.id>=113000&&material.id<114000&&source){
  const weekly=/挑战奖励/.test(source);
  return {type:weekly?'weekly':'boss',location:source.replace(/^\d+级以上/,'').replace(/挑战奖励.*$|掉落.*$/,'').trim(),days:[0,1,2,3,4,5,6],yield:1};
 }
 return null;
}

export function artifactUpgradeCost(db,items,{complete=false}={}){
 if(!Array.isArray(items))return {known:false,exp:null,mora:null,missing:5,items:[]};
 let exp=0;const result=[],positions=new Set();let missing=0;
 for(const a of items){const max=db.experience.artifacts?.maxLevels[a.rarity];if(!max||!Number.isInteger(a.level)||a.level<0||a.level>max||positions.has(a.pos)){missing++;continue;}positions.add(a.pos);
  let cost=0;for(let level=a.level;level<max;level++){const r=db.experience.artifacts.rows.find(r=>r[0]===a.rarity&&r[1]===level);if(!r)throw new Error('圣遗物经验表缺失');cost+=r[2];}
  exp+=cost;result.push({...a,target:max,exp:cost});
 }
 if(!complete)missing+=Math.max(0,5-items.length);return {known:missing===0,exp,mora:exp,missing,items:result};
}
export function trainingMaterial(db,id){return id===-1?{id,name:'角色经验',sources:['启示之花'],days:[0,1,2,3,4,5,6],domain:'',type:'升级经验'}:id===-2?{id,name:'武器经验',sources:['矿石 / 锻造 / 洞天百宝'],days:[],domain:'',type:'升级经验'}:id===-3?{id,name:'圣遗物经验',sources:['祝圣素材 / 未装备圣遗物素材 / 洞天百宝'],days:[],domain:'',type:'升级经验'}:db.materials[id];}
export function levelTargetOptions(max=90){
 const boundaries=[20,40,50,60,70,80],rows=[];
 for(let level=1;level<=max;level++){const ascension=boundaries.filter(n=>n<level).length,cap=boundaries[ascension]??90;rows.push({level,ascension,value:level+':'+ascension,label:level+' / '+Math.min(cap,max)+' 级'+(boundaries.includes(level)?'（未突破）':'')});if(boundaries.includes(level)&&level<max)rows.push({level,ascension:ascension+1,value:level+':'+(ascension+1),label:level+' / '+Math.min(boundaries[ascension+1]??90,max)+' 级（已突破）'});}
 return rows;
}
export function setCharacterTarget(state,db,{itemKey,level,ascension,talents,artifacts=true,verified=false}){
 const current=catalogProgress(state,'characters',{key:itemKey});
 if(current.level===null||current.ascension===null)throw new Error('请先核对当前角色等级与突破阶段');
 if(!levelTargetOptions().some(o=>o.level===level&&o.ascension===ascension)||level<current.level||ascension<current.ascension)throw new Error('目标等级或突破不能低于当前状态');
 if(!Array.isArray(talents)||talents.length!==3)throw new Error('需要三项天赋目标');
 let next=structuredClone(state);next.trainingRequests=(next.trainingRequests??[]).filter(r=>r.itemKey!==itemKey&&!(itemKey.startsWith('traveler')&&['characterLevel','characters','artifacts'].includes(r.kind)&&r.itemKey.startsWith('traveler')));
 const add=(kind,from,to,slot=0)=>{next=addTrainingRequest(next,db,{kind,itemKey,from,to,slot,verified,autoArtifacts:false,allowNoCost:true,deferRebuild:true});};
 add('characterLevel',current.level,level);add('characters',current.ascension,ascension);
 for(let slot=0;slot<3;slot++){const target=talents[slot],from=current.talents[slot];if(target===null)continue;if(from===null)throw new Error('请先核对当前基础天赋');if(!Number.isInteger(target)||target<1||target>10)throw new Error('天赋目标需要1–10级');add('talents',from,Math.max(from,target),slot);}
 if(artifacts)add('artifacts',0,1);
 return rebuildTrainingGoals(next,db);
}
export function setWeaponTarget(state,db,{itemKey,instance='',level,ascension}){
 const item=db.weapons.find(w=>w.key===itemKey);if(!item)throw new Error('武器条目不存在');const current=catalogProgress(state,'weapons',item,instance),max=item.rarity<=2?70:90;
 if(current.level===null||current.ascension===null)throw new Error('请先读取或核对当前武器等级与突破阶段');
 if(!levelTargetOptions(max).some(o=>o.level===level&&o.ascension===ascension)||level<current.level||ascension<current.ascension)throw new Error('目标等级或突破不能低于当前状态');
 let next=structuredClone(state);next.trainingRequests=(next.trainingRequests??[]).filter(r=>!(r.itemKey===itemKey&&['weapons','weaponLevel'].includes(r.kind)));
 for(const [kind,from,to]of [['weaponLevel',current.level,level],['weapons',current.ascension,ascension]])next=addTrainingRequest(next,db,{kind,itemKey,from,to,autoArtifacts:false,allowNoCost:true,deferRebuild:true});
 return rebuildTrainingGoals(next,db);
}
export function addTrainingRequest(state,db,{kind,itemKey,slot=0,from,to,verified=false,autoArtifacts=true,allowNoCost=false,deferRebuild=false}){
 const folder=['characterLevel','artifacts'].includes(kind)?'characters':kind==='weaponLevel'?'weapons':kind;
 const item=(folder==='characters'?db.travelerForms?.find(c=>c.key===itemKey):null)??db[folder]?.find(c=>c.key===itemKey);
 if(!item||!['characters','weapons','talents','characterLevel','weaponLevel','artifacts'].includes(kind))throw new Error('未找到升级条目');
 if(kind==='talents'&&(!Number.isInteger(slot)||slot<0||slot>2))throw new Error('请选择天赋项目');
 if(kind==='talents'&&to>from&&itemKey.startsWith('traveler')&&!verified)throw new Error('旅行者上游通用表未区分三项天赋，请先核对该项成本并勾选确认');
 let rows,pending=false;if(['characterLevel','weaponLevel'].includes(kind)){const exp=levelExperience(db,folder,item.rarity,from,to);rows=[{id:202,count:Math.ceil(exp/(folder==='characters'?5:10))},{id:folder==='characters'?-1:-2,count:exp}];}
 else if(kind==='artifacts'){const loadout=state.artifactLoadouts?.[item.sharedProgressKey??itemKey],cost=artifactUpgradeCost(db,loadout?.items,{complete:loadout?.complete===true});pending=!cost.known;from=0;to=1;rows=cost.known?[{id:202,count:cost.mora},{id:-3,count:cost.exp}]:[];}
 else rows=aggregateCosts(item,from,to);
 rows=rows.filter(r=>r.count!==0);if(!rows.length&&kind!=='artifacts'&&!allowNoCost)throw new Error('当前与目标相同，无新增升级消耗');if(rows.some(r=>r.count===null))throw new Error('上游数量缺失，不能生成完整目标');
 const key=['characters','characterLevel','artifacts'].includes(kind)&&item.sharedProgressKey==='traveler'?'traveler':itemKey,id=kind+'-'+key+(kind==='talents'?'-'+slot:'');
 const name=item.name+(kind==='talents'?' · '+['普通攻击','元素战技','元素爆发'][slot]:kind.endsWith('Level')?' · 等级':kind==='artifacts'?' · 当前圣遗物升满':' · 突破');
 const request={id,kind,itemKey,slot,from,to,name,rows,pending};const next=structuredClone(state);
 next.trainingRequests=(next.trainingRequests??[]).filter(r=>r.id!==id);next.trainingRequests.push(request);
 if(autoArtifacts&&kind!=='artifacts'&&!['weapons','weaponLevel'].includes(kind)){
  const owner=itemKey.startsWith('traveler')?'traveler':itemKey,artifactId='artifacts-'+owner;
  if(!next.trainingRequests.some(r=>r.id===artifactId)){const loadout=next.artifactLoadouts?.[owner],cost=artifactUpgradeCost(db,loadout?.items,{complete:loadout?.complete===true});next.trainingRequests.push({id:artifactId,kind:'artifacts',itemKey,slot:0,from:0,to:1,name:item.name+' · 当前圣遗物升满',pending:!cost.known,rows:cost.known&&cost.exp?[{id:202,count:cost.mora},{id:-3,count:cost.exp}]:[]});}
 }
 if(kind==='characterLevel'||kind==='weaponLevel')next.goals=next.goals.filter(g=>!g.id.startsWith('growth-'+folder+'-'+key+'-'));
 return deferRebuild?next:rebuildTrainingGoals(next,db);
}
export function removeTrainingRequest(state,db,id){const next=structuredClone(state);next.trainingRequests=(next.trainingRequests??[]).filter(r=>r.id!==id);return rebuildTrainingGoals(next,db);}
export function removeTrainingTarget(state,db,itemKey){const next=structuredClone(state);next.trainingRequests=(next.trainingRequests??[]).filter(r=>r.itemKey!==itemKey);return rebuildTrainingGoals(next,db);}
export function migrateLegacyLevelTargets(state,db){
 let next=state;const seen=new Set();for(const g of state.goals){const match=/^growth-(characters|weapons)-([a-z0-9]+)-(mora|exp)$/.exec(g.id),range=/Lv\.(\d+)→(\d+)/.exec(g.name);if(!match||!range||seen.has(match[1]+'-'+match[2]))continue;seen.add(match[1]+'-'+match[2]);
  const itemKey=match[2]==='traveler'?'traveleranemo':match[2];next=addTrainingRequest(next,db,{kind:match[1]==='characters'?'characterLevel':'weaponLevel',itemKey,from:Number(range[1]),to:Number(range[2])});
 }
 return next;
}
export function refreshTrainingTargets(state,db){
 if(!state.trainingRequests?.length)return state;const next=structuredClone(state);
 for(const r of next.trainingRequests){
  if(r.itemKey==='traveler')r.itemKey=next.trainingRequests.find(t=>t.kind==='talents'&&t.itemKey.startsWith('traveler'))?.itemKey??'traveleranemo';
  const key=r.itemKey==='traveler'?'traveleranemo':r.itemKey,folder=['weapons','weaponLevel'].includes(r.kind)?'weapons':r.kind==='talents'?'talents':'characters',p=catalogProgress(next,folder,folder==='weapons'?(db.weapons.find(w=>w.key===key)??{key}):{key});
  if(r.kind==='artifacts'){const loadout=next.artifactLoadouts?.[r.itemKey.startsWith('traveler')?'traveler':r.itemKey],cost=artifactUpgradeCost(db,loadout?.items,{complete:loadout?.complete===true});r.pending=!cost.known;r.rows=cost.known&&cost.exp?[{id:202,count:cost.mora},{id:-3,count:cost.exp}]:[];continue;}
  if(!['characterLevel','characters','talents','weapons','weaponLevel'].includes(r.kind))continue;
  const current=r.kind.endsWith('Level')?p.level:['characters','weapons'].includes(r.kind)?p.ascension:p.talents[r.slot];if(current===null)continue;r.from=current;r.to=Math.max(current,r.to);
  if(r.from===r.to){r.rows=[];continue;}
  const item=(folder==='characters'?db.travelerForms?.find(c=>c.key===key):null)??db[folder].find(c=>c.key===key);if(!item)continue;
  if(r.kind.endsWith('Level')){const exp=levelExperience(db,folder,item.rarity,r.from,r.to);r.rows=[{id:202,count:Math.ceil(exp/(folder==='weapons'?10:5))},{id:folder==='weapons'?-2:-1,count:exp}];}else r.rows=aggregateCosts(item,r.from,r.to);
 }
 return rebuildTrainingGoals(next,db);
}
function rebuildTrainingGoals(next,db){
 const sum=new Map();for(const r of next.trainingRequests)for(const m of r.rows)sum.set(m.id,(sum.get(m.id)??0)+m.count);
 const previous=new Map(next.goals.filter(g=>g.id.startsWith('training-material-')).map(g=>[g.id,g]));
 next.goals=next.goals.filter(g=>!g.id.startsWith('training-material-'));
 const stocks=new Map((next.materialInventory?.items??[]).map(m=>[m.id,m.count]));
 for(const [id,values]of [[-1,[[104001,1000],[104002,5000],[104003,20000]]],[-2,[[104011,400],[104012,2000],[104013,10000]]]])if(values.some(([materialId])=>stocks.has(materialId)))stocks.set(id,values.reduce((n,[materialId,exp])=>n+(stocks.get(materialId)??0)*exp,0));
 if(next.economy?.mora!==null&&next.economy?.mora!==undefined&&!stocks.has(202))stocks.set(202,next.economy.mora);
 for(const [materialId,need]of sum){
  const m=trainingMaterial(db,materialId);if(!m)throw new Error('材料引用缺失');const id='training-material-'+materialId,old=previous.get(id),route=materialId===-1?{type:'leyline',location:'启示之花',yield:122500,days:[0,1,2,3,4,5,6]}:materialRoute(m);
  // A boss may be claimed once a week. Other drops from the same boss stay a supply check.
  const weeklyConflict=route?.type==='weekly'&&next.goals.some(g=>g.type==='weekly'&&g.location===route.location);
  const owned=old?.owned??(stocks.has(materialId)?Math.max(0,stocks.get(materialId)-next.goals.filter(g=>g.material===m.name).reduce((n,g)=>n+g.owned,0)):0);
  next.goals.push({id,name:'养成合计 · '+m.name,material:m.name,need,owned,stockKnown:old?.stockKnown??stocks.has(materialId),location:weeklyConflict?'核对 '+route.location+' 实际掉落 / 溶媒转化':route?.location??(m.sources?.filter(s=>!s.startsWith('占位')).join(' / ').slice(0,100)||'核对库存及特殊来源'),type:route&&!weeklyConflict?route.type:'supply',yield:old?.yield??route?.yield??1,days:old?.days??route?.days??[0,1,2,3,4,5,6],priority:old?.priority??3,deadline:old?.deadline??'',status:old?.status??'current'});
 }
 return next;
}

// Concise factual index, independently summarized from the linked wiki pages.
// Renewable means the source returns; it does not imply unlimited claims each day.
export const RENEWABLE_SOURCES=[
 ['藏金之花','摩拉','树脂','20 原粹 / 份；世界等级 6–9 为 60000 摩拉，低世界等级减少。','藏金之花'],
 ['启示之花','角色经验','树脂','20 原粹 / 份；世界等级 6–9 为 6–7 蓝书与 4–5 紫书，折算 110000–135000 经验。','藏金之花'],
 ['精通秘境','天赋书','限日树脂','按材料开放日；周日全开；限时全开以当期公告为准。','新手指南'],
 ['炼武秘境','武器突破材料','限日树脂','按材料开放日，按品级统计；不能把不同品级原样相加。','新手指南'],
 ['祝圣秘境','圣遗物 / 圣遗物经验','树脂','20 原粹 / 份；浓缩领取三份，随机词条不保证毕业。','新手指南'],
 ['普通首领','角色突破材料 / 宝石 / 圣遗物','树脂','40 原粹 / 份；同场副产物不能分别重复计入体力成本。','新手指南'],
 ['征讨领域与北风狼','周本天赋材料 / 原胚 / 溶媒 / 宝石','每周','各首领每周领奖一次；前三次 30 原粹，其后 60。','新手指南'],
 ['野外普通怪与精英怪','怪物掉落材料 / 摩拉 / 经验 / 部分圣遗物','刷新采集','按怪物等级、掉落表与刷新限制；击杀无树脂成本，不等于无时间成本。','角色系统'],
 ['区域特产采集','角色突破特产','刷新采集','按对应采集物刷新；库存耗尽后等待刷新或经对方允许进入联机世界。','新手教程'],
 ['矿点与富集矿点','武器经验矿石 / 锻造矿','刷新采集','普通矿与每日矿点规则不同；须区分旧版计时规则与新版跨日刷新。','新手教程'],
 ['捕捉晶蝶','晶核','刷新采集','用于合成浓缩树脂；捕捉点位和刷新以当前地图为准。','晶核'],
 ['晶蝶诱捕装置','晶核','7 天冷却','需要投入材料；领取后计时七天，不能按每周一重置计算。','晶蝶诱捕装置'],
 ['探索派遣','摩拉 / 矿石 / 采集物','计时派遣','派遣完成后领取并重新派遣；产量随时长、地点、角色加成变化。','冒险家协会'],
 ['每日委托与历练点','摩拉 / 武器经验矿 / 冒险阅历','每日','每日四份加协会额外奖励；委托和历练点共享领奖次数，不重复算。','每日委托'],
 ['突发事件','摩拉 / 武器经验矿 / 好感','每日限额','有每日收益次数限制，不能视为无限刷摩拉。','角色系统'],
 ['调查点与拾取物','低星圣遗物 / 摩拉 / 矿物','刷新采集','只有可刷新的点位属于此类；调查上限及点位冷却需按路线核对。','新手教程'],
 ['NPC 补货商店','特产 / 低星武器与圣遗物 / 矿石','商店补货','消耗摩拉；各店货物、补货周期和限购不同，只纳入可补货商品。','商店'],
 ['洞天百宝','须臾树脂 / 经验书 / 魔矿 / 摩拉 / 圣遗物经验','每周','周一 04:00 补货，受信任等级、宝钱和周限购约束；已接入日程。','尘歌壶世界'],
 ['洞天聚宝盆与田亩','宝钱 / 可种植特产','计时生产','宝钱有储存上限；种植受田亩、种子和生长时间限制，不能代替全部特产采集。','尘歌壶世界'],
 ['铁匠铺锻造','武器经验矿 / 可锻造武器','转换 / 日限额','消耗矿石与摩拉；魔晶块配方还消耗原粹树脂。矿石不足不能凭空获得经验。','锻造'],
 ['炼金合成与转化','高阶材料 / 宝石 / 周本材料 / 原胚','库存转换','消耗低阶材料、摩拉及对应转化媒介；副产物概率不作为保证产量。','炼金'],
 ['参量质变仪','摩拉 / 经验 / 矿 / 天赋及突破素材','7 天冷却','投入材料后随机转化，收益未知；仅做来源参考，不预支随机奖励。','参量质变仪'],
 ['圣遗物喂养、分解与还圣奥迹','圣遗物经验 / 摩拉 / 随机套装','库存转换','同一件素材只能喂养、分解或转换一次；不重复计算其价值。','圣遗物属性'],
 ['星尘 / 星辉兑换','摩拉 / 经验矿 / 怪物材料等','月度商店','消耗祈愿获得的货币；有月限购和机会成本，不自动建议用抽卡资源购买。','商店'],
 ['深境螺旋 9–12 层','摩拉 / 经验书 / 圣遗物 / 原石','月度挑战','渊月奖励每月 16 日重置；1–8 层永久奖励不属于可再生来源。','深境螺旋'],
 ['幻想真境剧诗巡演','摩拉 / 天赋材料 / 圣遗物经验等','月度挑战','巡演奖励每月 1 日重置；初演馈赠为一次性，排除在再生收益外。','幻想真境剧诗'],
 ['幽境危战','活动奖励 / 圣遗物 / 危战兑换收益','周期挑战','按当期难度、紊乱爆发窗口及奖励限制核对；树脂圣遗物领奖与固定奖励分开。','幽境危战'],
 ['大地纪行及已开通的珍珠纪行','摩拉 / 经验书 / 矿 / 树脂等','每期','仅算当期能完成的等级；付费轨道必须已购买，不能默认持有。','纪行'],
 ['版本活动与网页活动','公告列明的养成素材','每期有限','活动类型会再出现，但每期奖励有限；仅经日期、资格及奖励核验后加入领奖日程。','活动一览'],
 ['满冒险等阶阅历转换','摩拉','附带收入','冒险等阶 60 后，额外冒险阅历按 1:10 转摩拉；不作为独立刷取途径。','1.4版本「风花的邀约」更新专题']
].map(([name,materials,cycle,rule,page],i)=>({id:'source-'+i,name,materials,cycle,rule,url:'https://wiki.biligame.com/ys/'+encodeURIComponent(page),checkedAt:'2026-10-15'}));

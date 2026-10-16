// Downloads data only. No upstream package code or lifecycle scripts are executed.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const version=process.argv[2]||'5.2.14';
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Expected an explicit npm version');
const get=async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(120000),headers:{'User-Agent':'TeyvatLocalPlanner/1.0'}});if(!response.ok)throw new Error(`${response.status}: ${url}`);return response;};
await mkdir(path.join(root,'.cache'),{recursive:true});await mkdir(path.join(root,'data'),{recursive:true});
const pkg=await (await get(`https://registry.npmjs.org/genshin-db/${version}`)).json();
const archive=path.join(root,'.cache',`genshin-db-${version}.tgz`);
let bytes;try{bytes=await readFile(archive);}catch{bytes=Buffer.from(await (await get(pkg.dist.tarball)).arrayBuffer());}
const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
if(integrity!==pkg.dist.integrity)throw new Error('npm integrity check failed; cached data was not used');
await writeFile(archive,bytes);
const extract=name=>execFileSync('tar',['-xOf',archive,`package/${name}`],{maxBuffer:300*1024*1024,windowsHide:true}).toString('utf8');
const all=JSON.parse(extract('src/min/data.min.json')),zh=all.data.ChineseSimplified;
await writeFile(path.join(root,'data','GENSHIN-DB-LICENSE.txt'),extract('LICENSE'));
const used=new Set();
const incompleteCosts=[];
function costs(value,key){const output={};for(const [stage,rows]of Object.entries(value||{})){output[stage]=rows.map(r=>{used.add(r.id);if(r.count===undefined){incompleteCosts.push({key,stage,materialId:r.id});return {id:r.id,count:null};}if(!Number.isInteger(r.count)||r.count<0)throw new Error('Invalid material cost');return {id:r.id,count:r.count};});}return output;}
function items(folder){return Object.entries(zh[folder]).map(([key,item])=>({key,id:item.id,name:item.name,rarity:item.rarity??null,weapon:item.weaponText??'',element:item.elementText??'',introduced:all.version?.[folder]?.[key]??null,costs:costs(item.costs,key),...(folder==='talents'?{skills:[1,2,3].map(i=>item['combat'+i]?.name??'')}:{} )}));}
const characters=items('characters'),weapons=items('weapons'),talents=items('talents');
const missingTalents=characters.filter(c=>!['aether','lumine'].includes(c.key)&&!talents.some(t=>t.key===c.key)).map(c=>({key:c.key,name:c.name,reason:'上游无同名天赋材料表，未猜测或补造'}));
const domains=new Map(Object.values(zh.domains).map(d=>[d.id,d]));
const materials={};
const crafts=Object.entries(zh.crafts).flatMap(([key,c])=>{const target=zh.materials[key];return target&&used.has(target.id)&&c.resultCount===1&&c.recipe.length===1&&c.recipe[0].count===3?[{id:c.id,inputId:c.recipe[0].id,outputId:target.id,inputCount:3,outputCount:1,mora:c.moraCost,unlockRank:c.unlockRank,inputName:c.recipe[0].name,outputName:target.name,rarity:target.rarity}]:[];});
for(const r of crafts)used.add(r.inputId);
for(const m of Object.values(zh.materials))if(used.has(m.id)||[104003,104013].includes(m.id)){
 const domain=domains.get(m.dropDomainId);
 materials[m.id]={id:m.id,name:m.name,rarity:m.rarity,type:m.typeText,category:m.category,sources:m.sources??[],days:(m.daysOfWeek??[]).map(d=>['周日','周一','周二','周三','周四','周五','周六'].indexOf(d)).filter(d=>d>=0),domain:domain?.entranceName??m.dropDomainName??''};
}
for(const id of used)if(!materials[id])throw new Error('Unresolved material ID: '+id);
let experience=null;
try{
 const commit=await (await get('https://api.github.com/repos/DimbreathBot/AnimeGameData/commits/main')).json();
 if(!/^[a-f0-9]{40}$/.test(commit.sha))throw new Error('Invalid source revision');
 const base=`https://raw.githubusercontent.com/DimbreathBot/AnimeGameData/${commit.sha}/ExcelBinOutput/`;
 const [avatar,weapon,reliquary]=await Promise.all(['AvatarLevelExcelConfigData.json','WeaponLevelExcelConfigData.json','ReliquaryLevelExcelConfigData.json'].map(async f=>(await get(base+f)).json()));
 const maxArtifactLevels=[0,4,4,12,16,20];
 experience={artifacts:{maxLevels:maxArtifactLevels,rows:reliquary.filter(r=>r.rank&&r.level<=maxArtifactLevels[r.rank]).map(r=>[r.rank,r.level-1,r.exp])},source:'https://github.com/DimbreathBot/AnimeGameData',revision:commit.sha,maxSupportedLevel:90,characters:avatar.filter(x=>x.level<90).map(x=>[x.level,x.exp]),weapons:weapon.filter(x=>x.level<90).map(x=>[x.level,x.requiredExps])};
 if(experience.characters.length!==89||experience.weapons.length!==89)throw new Error('Incomplete experience tables');
}catch(error){console.warn('Experience tables unavailable: '+error.message);throw error;}
const output={meta:{schemaVersion:1,source:'https://github.com/theBowja/genshin-db',packageVersion:version,gameVersion:(pkg.description.match(/v([\d.]+)/)||[])[1]??null,downloadedAt:new Date().toISOString(),integrity,counts:{characters:characters.length,weapons:weapons.length,talents:talents.length,materials:Object.keys(materials).length},missingTalents,limits:['上游单项天赋通用成本表未区分旅行者普通攻击与战技/爆发的特殊差异；请在游戏内核验。','突破材料支持阶段 0–6（低星武器最高阶段 4）；经验表仅覆盖 1–90，90 级以上特殊成长未纳入。','上游收录的条目不等于当前账号已拥有，也不等于均已实装；请核对 introduced 字段及游戏公告。']},characters,weapons,talents,materials,experience};
output.meta.incompleteCosts=incompleteCosts;
output.crafts=crafts;
const travelerElements=[['anemo','风'],['geo','岩'],['electro','雷'],['dendro','草'],['hydro','水'],['pyro','火'],['cryo','冰']];
const baseTraveler=characters.find(c=>c.key==='aether');
output.travelerForms=travelerElements.map(([element,label])=>({...baseTraveler,key:'traveler'+element,id:'traveler-'+element,name:'旅行者 · '+label,element:label,sharedProgressKey:'traveler',talentKey:'traveler'+element,sourceCharacterIds:[10000005,10000007]}));
output.meta.travelerPolicy='七元素天赋和目标独立记录；等级、突破和已持有材料共用，不能重复扣除。男女主使用同一元素材料表。';
await writeFile(path.join(root,'data','catalog.json'),JSON.stringify(output));
console.log(JSON.stringify({...output.meta,bytes:Buffer.byteLength(JSON.stringify(output))},null,2));

import crypto from 'node:crypto';
import {stat} from 'node:fs/promises';
const PUBLIC_KEY=`-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDDvekdPMHN3AYhm/vktJT+YJr7
cI5DcsNKqdsx5DZX0gDuWFuIjzdwButrIYPNmRJ1G8ybDIF7oDW2eEpm5sMbL9zs
9ExXCdvqrn51qELbqj0XxtMTIpaCHFSI50PfPpTFV9Xt/hmyVwokoOXFlAEgCn+Q
CgGs52bFoYMtyi+xEQIDAQAB
-----END PUBLIC KEY-----`;
const RECORD='https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/';
const CALC='https://api-takumi.mihoyo.com/event/e20200928calculate/';
const ALLOWED=new Set(['passport-api.miyoushe.com','api-takumi.mihoyo.com','api-takumi-record.mihoyo.com','bbs-api.miyoushe.com']);
export class AccountAPIError extends Error{constructor(stage,code,message=''){super(`${stage}: ${code}`);this.stage=stage;this.code=code;this.apiMessage=typeof message==='string'?message.slice(0,200):'';}}
function ds(body,query){const t=Math.floor(Date.now()/1000),r=crypto.randomInt(100001,200001),q=new URLSearchParams(Object.entries(query??{}).sort(([a],[b])=>a.localeCompare(b))).toString();return `${t},${r},${crypto.createHash('md5').update(`salt=xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs&t=${t}&r=${r}&b=${body??''}&q=${q}`).digest('hex')}`;}
export class AccountClient{
 #cookies=new Map(); #deviceId=crypto.randomUUID(); #verification=null; #pendingChallenge=null; #blockedRecords=new Map();
 role=null; roles=[]; lastRaw=null; fallbackCharacters=null; selectedCharacterIds=[];
 #calculatorRisk=null; #riskToken=null;
 async login(username,password){
  const t=Math.floor(Date.now()/1000),r=crypto.randomBytes(4).toString('hex').slice(0,6),hash=crypto.createHash('md5').update(`salt=LyD1rXqMv2GJhnwdvCBjFOKGiKuLY3aO&t=${t}&r=${r}`).digest('hex');
  const encrypt=s=>crypto.publicEncrypt({key:PUBLIC_KEY,padding:crypto.constants.RSA_PKCS1_PADDING},Buffer.from(s)).toString('base64');
  const response=await fetch('https://passport-api.miyoushe.com/account/ma-cn-passport/web/loginByPassword',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','x-rpc-app_id':'bll8iq97cem8','x-rpc-client_type':'4','x-rpc-source':'v2.webLogin','x-rpc-device_id':this.#deviceId,'x-rpc-game_biz':'bbs_cn','x-rpc-sdk_version':'2.31.0',ds:`${t},${r},${hash}`},body:JSON.stringify({account:encrypt(username),password:encrypt(password)})});
  const result=await response.json();if(result.retcode!==0)throw new AccountAPIError('login',result.retcode);this.#readCookies(response);if(!this.#cookies.size)throw new AccountAPIError('login','NO_COOKIES');
 }
 #readCookies(response){for(const line of response.headers.getSetCookie()){const pair=line.split(';')[0],pos=pair.indexOf('=');if(pos>0)this.#cookies.set(pair.slice(0,pos),pair.slice(pos+1));}}
 async request(url,{method='GET',query={},body,stage='api',signed=true,extraHeaders={}}={}){
  const target=new URL(url);if(target.protocol!=='https:'||!ALLOWED.has(target.hostname))throw new Error('Unexpected account API host');
  for(const [key,value]of Object.entries(query))target.searchParams.set(key,String(value));
  const encoded=body?JSON.stringify(body).replace(/,/g,', ').replace(/:/g,': '):undefined;
  const headers={'Content-Type':'application/json','Cookie':[...this.#cookies].map(([k,v])=>`${k}=${v}`).join('; '),'x-rpc-device_id':this.#deviceId,'x-rpc-app_version':'2.11.1','x-rpc-client_type':'5','Referer':'https://webstatic.mihoyo.com/','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'};
  if(signed)headers.ds=ds(encoded,query);
  if(this.#verification)headers['x-rpc-challenge']=this.#verification.challenge;
  Object.assign(headers,extraHeaders);
  if(target.pathname.includes('/e20200928calculate/')){headers.Referer='https://webstatic.mihoyo.com/ys/event/e20200923adopt_calculator/index.html';if(this.#riskToken)headers['x-rpc-risk_token']=this.#riskToken;}
  const response=await fetch(target,{method,headers,body:encoded,redirect:'error',signal:AbortSignal.timeout(25000)});
  const data=await response.json();this.#readCookies(response);
  if(data.retcode===10034&&target.pathname.includes('/e20200928calculate/')){try{const risk=JSON.parse(response.headers.get('x-rpc-verify')??'null');if(risk?.ticket&&risk?.token)this.#calculatorRisk={ticket:risk.ticket,token:risk.token,created:Date.now()};}catch{}}
  if(data.retcode===1034&&target.hostname==='api-takumi-record.mihoyo.com'&&target.pathname.includes('/app/genshin/api/'))this.#blockedRecords.set(stage,{path:target.pathname.replace(/^\/game_record/,''),trace:response.headers.get('x-trace-id')??''});
  else if(data.retcode===0)this.#blockedRecords.delete(stage);
  if(data.retcode!==0)throw new AccountAPIError(stage,data.retcode,data.message);return data.data;
 }
 async #recordProtocol(){const url=new URL('record-verification.mjs',import.meta.url);const info=await stat(url);return import(url.href+'?revision='+info.mtimeMs);}
 async createChallenge(){
  if(this.#calculatorRisk&&Date.now()-this.#calculatorRisk.created<600000)return {kind:'calculator',ticket:this.#calculatorRisk.ticket};
  const blocked=this.#blockedRecords.get('notes')??this.#blockedRecords.get('characters')??this.#blockedRecords.values().next().value;
  const protocol=await this.#recordProtocol();const result=await protocol.createRecordChallenge(this.request.bind(this),blocked);this.#pendingChallenge=result.pending;return result.public;
 }
 async submitChallenge(result){
  if(result.kind==='calculator'){if(!this.#calculatorRisk||Date.now()-this.#calculatorRisk.created>600000)throw new Error('VERIFICATION_EXPIRED');this.#riskToken=this.#calculatorRisk.token;this.#calculatorRisk=null;return;}
  const protocol=await this.#recordProtocol();this.#verification=await protocol.submitRecordChallenge(this.request.bind(this),this.#pendingChallenge,result);this.#pendingChallenge=null;
 }
 async refreshRaw(){
  const roles=await this.request('https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie',{query:{game_biz:'hk4e_cn'},stage:'roles'});
  this.roles=(roles.list??[]).filter(r=>r.game_biz==='hk4e_cn'||['cn_gf01','cn_qd01'].includes(r.region));
  if(!this.roles.length)throw new AccountAPIError('roles','NO_GENSHIN_ROLE');
  this.role=this.roles.find(r=>r.game_uid===this.role?.game_uid)||this.roles.find(r=>r.is_chosen)||this.roles[0];
  const role=this.role,params={role_id:String(role.game_uid),server:role.region};
  const raw={syncedAt:new Date().toISOString(),roles:this.roles,role,errors:{}};
  const capture=async(key,task)=>{try{raw[key]=await task();}catch(e){raw.errors[key]={code:e.code??e.cause?.code??e.name,stage:e.stage??key,message:e.apiMessage??''};}};
  await Promise.all([
   capture('notes',()=>this.request(RECORD+'dailyNote',{query:params,stage:'notes'})),
   capture('characters',()=>this.request(RECORD+'character/list',{method:'POST',body:params,stage:'characters'})),
   capture('index',()=>this.request(RECORD+'index',{query:params,stage:'index'}))
  ]);
  const fallback=this.fallbackCharacters,ids=(raw.characters?.list??[]).map(c=>c.id);
  if(!ids.length&&fallback?.uid===String(role.game_uid)&&fallback.region===role.region)ids.push(...fallback.ids);
  ids.splice(0,ids.length,...ids.filter(id=>this.selectedCharacterIds.includes(id)));
  if(ids.length)await capture('details',()=>this.request(RECORD+'character/detail',{method:'POST',body:{...params,character_ids:ids},stage:'details'}));
  if(ids.length)await capture('calculatorCharacters',async()=>{const list=[];for(const avatar_id of ids){const result=await this.request(CALC+'v1/sync/avatar/detail',{query:{avatar_id,uid:String(role.game_uid),region:role.region,lang:'zh-cn'},stage:'calculatorCharacters',signed:false});if(result.avatar)list.push(result.avatar);}return {list};});
  const equipped=(raw.details?.list??raw.characters?.list??[]).filter(c=>ids.includes(c.id??c.base?.id)).map(c=>({...c.base,...c,id:c.id??c.base?.id}));
  const url=new URL('calculator-sync.mjs',import.meta.url),info=await stat(url),sync=await import(url.href+'?revision='+info.mtimeMs);
  const result=await sync.readInventory(this.request.bind(this),role,equipped.length?equipped:ids.map(id=>({id})));
  if(result.inventory)raw.inventory=result.inventory;if(result.error)raw.errors.inventory=result.error;
  this.lastRaw=raw;return raw;
 }
}

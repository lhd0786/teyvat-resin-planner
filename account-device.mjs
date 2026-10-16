// Adapted from SeelieEx common.ts/getFp and inventory-common.ts/buildBaseHeaders.
// Source and MIT declaration: THIRD_PARTY_NOTICES.md (pinned upstream revision).
import crypto from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';

const DEVICE_FP_URL='https://public-data-api.mihoyo.com/device-fp/api/getFp';
const deviceFile=new URL('.private/device.json',import.meta.url);
const USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);

// SeelieEx's fixed compatibility profile; these are not readings of this PC.
// Keep its platform-1 FP registration separate from the calculator's platform-4 headers.
function fingerprintBody(deviceId){
 const id=deviceId.toUpperCase();
 return {seed_id:crypto.randomBytes(8).toString('hex'),device_id:id,platform:'1',seed_time:String(Date.now()),
  ext_fields:JSON.stringify({proxyStatus:'0',accelerometer:'-0.159515x-0.830887x-0.682495',ramCapacity:'3746',IDFV:id,gyroscope:'-0.191951x-0.112927x0.632637',isJailBreak:'0',model:'iPhone12,5',ramRemain:'115',chargeStatus:'1',networkType:'WIFI',vendor:'--',osVersion:'17.0.2',batteryStatus:'50',screenSize:'414×896',cpuCores:'6',appMemory:'55',romCapacity:'488153',romRemain:'157348',cpuType:'CPU_TYPE_ARM64',magnetometer:'-84.426331x-89.708435x-37.117889'}),
  app_name:'bbs_cn',device_fp:'38d7ee834d1e9'};
}

export function createDeviceIdentity({fetchImpl=fetch,now=Date.now,
 readIdentity=async()=>JSON.parse(await readFile(deviceFile,'utf8')),
 writeIdentity=async value=>{await mkdir(new URL('.private/',import.meta.url),{recursive:true});const temp=new URL('.private/device.tmp',import.meta.url);await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,deviceFile);}
}={}){
 let identityPromise,fpPromise,fp=null,expiresAt=0,retryAt=0;
 const identity=()=>identityPromise??=(async()=>{let saved;try{saved=await readIdentity();}catch{}if(validId(saved?.deviceId))return saved.deviceId;const deviceId=crypto.randomUUID();await writeIdentity({schemaVersion:1,deviceId});return deviceId;})();
 return {
  async headers(){
   const deviceId=await identity();
   if(now()>=expiresAt&&now()>=retryAt){
    fpPromise??=(async()=>{try{
     const response=await fetchImpl(DEVICE_FP_URL,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Referer:'https://act.mihoyo.com/','User-Agent':USER_AGENT},body:JSON.stringify(fingerprintBody(deviceId))});
     const result=await response.json(),value=result.data?.device_fp;
     // retcode=0 alone is insufficient: the FP service can still return data.code=403.
     if(!response.ok||result.retcode!==0||result.data?.code!==200||typeof value!=='string'||!/^[a-z0-9]{6,100}$/i.test(value))throw new Error('DEVICE_FP_UNAVAILABLE');
     fp=value;expiresAt=now()+86400000;
    }catch{fp=null;expiresAt=0;retryAt=now()+1800000;}})();
    try{await fpPromise;}finally{fpPromise=null;}
   }
   return {'x-rpc-device_id':deviceId,...(fp?{'x-rpc-device_fp':fp}:{}),'x-rpc-platform':'4'};
  }
 };
}
export const accountDevice=createDeviceIdentity();

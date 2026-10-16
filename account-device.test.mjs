import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceIdentity} from './account-device.mjs';
const uuid='12345678-1234-4321-8123-123456789abc';
const response=(code=200)=>({ok:true,json:async()=>({retcode:0,data:{code,device_fp:'fresh123456'}})});
test('设备标识跨登录和服务实例保持一致，只保存非凭据标识',async()=>{
 let saved=null,writes=0,requests=0;
 const options={readIdentity:async()=>saved,writeIdentity:async value=>{writes++;saved=value;},fetchImpl:async()=>{requests++;return response();}};
 const first=createDeviceIdentity(options),a=await first.headers(),b=await first.headers(),c=await createDeviceIdentity(options).headers();
 assert.equal(a['x-rpc-device_id'],b['x-rpc-device_id']);assert.equal(a['x-rpc-device_id'],c['x-rpc-device_id']);assert.equal(writes,1);assert.equal(requests,2);assert.deepEqual(Object.keys(saved).sort(),['deviceId','schemaVersion']);
});
test('并发请求共享一次设备注册，使用稳定ID且不携带账号Cookie',async()=>{
 let calls=0;const device=createDeviceIdentity({readIdentity:async()=>({deviceId:uuid}),writeIdentity:async()=>assert.fail(),fetchImpl:async(url,options)=>{
  calls++;assert.equal(new URL(url).hostname,'public-data-api.mihoyo.com');assert.equal(options.headers.Cookie,undefined);assert.equal(options.redirect,'error');const body=JSON.parse(options.body);assert.equal(body.device_id,uuid.toUpperCase());assert.equal(JSON.parse(body.ext_fields).IDFV,uuid.toUpperCase());return response();
 }});
 const rows=await Promise.all([device.headers(),device.headers(),device.headers()]);assert.equal(calls,1);assert.equal(rows[0]['x-rpc-device_fp'],'fresh123456');assert.equal(rows[0]['x-rpc-platform'],'4');
});
test('指纹内层403不能作为成功使用，失败30分钟内不重复注册',async()=>{
 let time=0,calls=0;const device=createDeviceIdentity({now:()=>time,readIdentity:async()=>({deviceId:uuid}),fetchImpl:async()=>{calls++;return response(calls===1?403:200);}});
 assert.equal((await device.headers())['x-rpc-device_fp'],undefined);await device.headers();assert.equal(calls,1);time=1800000;assert.equal((await device.headers())['x-rpc-device_fp'],'fresh123456');assert.equal(calls,2);
});
test('指纹过期只更新指纹，不轮换设备ID',async()=>{
 let time=0,calls=0;const device=createDeviceIdentity({now:()=>time,readIdentity:async()=>({deviceId:uuid}),fetchImpl:async()=>{calls++;return response();}});
 const first=await device.headers();time=86400001;const second=await device.headers();assert.equal(calls,2);assert.equal(first['x-rpc-device_id'],second['x-rpc-device_id']);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startPlanner} from './server.mjs';
import {createAccountController} from './account-controller.mjs';
const memoryStore={readSnapshot:async()=>null,writeSnapshot:async()=>{}};
const networkRaw=value=>({syncedAt:new Date().toISOString(),role:{game_uid:'123456789',region:'cn_gf01'},roles:[],notes:{current_resin:value,current_home_coin:value},errors:{}});
test('连续更新每次都访问网络，不返回一分钟内的旧快照',async()=>{let calls=0;const controller=createAccountController({refreshRaw:async()=>networkRaw(++calls)},memoryStore);assert.equal((await controller.status()).networkRefreshed,false);const first=await controller.refresh(),second=await controller.refresh();assert.equal(calls,2);assert.equal(first.snapshot.notes.resin,1);assert.equal(second.snapshot.notes.resin,2);assert.equal(second.networkRefreshed,true);assert.deepEqual(second.updatedSections,['notes']);});
test('并发更新各自排队联网，不复用其他角色范围的请求结果',async()=>{const scopes=[],client={async refreshRaw(){scopes.push([...this.selectedCharacterIds]);await new Promise(r=>setTimeout(r,10));return networkRaw(scopes.length);}},controller=createAccountController(client,memoryStore);const [a,b]=await Promise.all([controller.refresh({characterIds:[10000111]}),controller.refresh({characterIds:[10000121]})]);assert.deepEqual(scopes,[[10000111],[10000121]]);assert.equal(a.snapshot.notes.resin,1);assert.equal(b.snapshot.notes.resin,2);});
test('联网失败不冒充更新，保留旧快照；失败后下次请求仍会联网',async()=>{let fail=false,calls=0;const controller=createAccountController({async refreshRaw(){calls++;if(fail)throw new Error('OFFLINE');return networkRaw(calls);}},memoryStore);await controller.refresh();fail=true;await assert.rejects(controller.refresh(),/OFFLINE/);assert.equal((await controller.status()).snapshot.notes.resin,1);fail=false;assert.equal((await controller.refresh()).snapshot.notes.resin,3);});
test('部分接口失败保留原读取时间并明确返回失败和本次成功项目',async()=>{let fail=false;const controller=createAccountController({async refreshRaw(){return fail?{...networkRaw(2),notes:undefined,errors:{notes:{code:1034}}}:networkRaw(1);}},memoryStore);const first=await controller.refresh();fail=true;const next=await controller.refresh();assert.deepEqual(next.failedSections,['notes']);assert.deepEqual(next.updatedSections,[]);assert.equal(next.snapshot.notes.syncedAt,first.snapshot.notes.syncedAt);assert.equal(next.snapshot.notes.resin,1);});
test('重复启动复用原服务，页面与脚本仍可访问',async()=>{
 const first=await startPlanner({port:0});
 try{
  const port=first.server.address().port;
  const second=await startPlanner({port});
  assert.equal(second.mode,'reused');assert.equal(second.url,first.url);
  for(const file of ['/','/app.js','/style.css'])assert.equal((await fetch(first.url+file)).status,200);
 }finally{await new Promise(resolve=>first.server.close(resolve));}
});
test('其他服务占用时给出清晰错误且不终止该服务',async()=>{
 const other=http.createServer((req,res)=>res.end('Other service'));
 await new Promise(resolve=>other.listen(0,'127.0.0.1',resolve));
 try{
  await assert.rejects(startPlanner({port:other.address().port}),/occupied by another service/);
  assert.equal(await (await fetch(`http://127.0.0.1:${other.address().port}/`)).text(),'Other service');
 }finally{await new Promise(resolve=>other.close(resolve));}
});
test('账号接口拒绝跨站访问、简单表单和私有文件读取',async()=>{
 const app=await startPlanner({port:0});
 try{
  assert.equal((await fetch(app.url+'/api/account',{headers:{Origin:'https://example.com'}})).status,403);
  assert.equal((await fetch(app.url+'/api/account/refresh',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,405);
  assert.equal((await fetch(app.url+'/.private/account.json')).status,404);
  assert.equal((await fetch(app.url+'/.cache/raw-game.json')).status,404);
  const status=await (await fetch(app.url+'/api/account')).json();assert.equal(status.sessionActive,false);
 }finally{await new Promise(resolve=>app.server.close(resolve));}
});
test('验证码页面放行极验样式及字体，普通页面保持本地资源策略',async()=>{
 const app=await startPlanner({port:0});
 try{
  const verification=await fetch(app.url+'/verify.html'),normal=await fetch(app.url+'/');
  const policy=verification.headers.get('content-security-policy');
  assert.match(policy,/style-src[^;]*https:\/\/\*\.geetest\.com/);
  assert.match(policy,/font-src[^;]*https:\/\/\*\.geetest\.com/);
  assert.ok(!normal.headers.get('content-security-policy').includes('geetest.com'));
 }finally{await new Promise(resolve=>app.server.close(resolve));}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startPlanner} from './server.mjs';
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

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AccountClient} from './account-client.mjs';
const device={headers:async()=>({'x-rpc-device_id':'stable-device','x-rpc-device_fp':'official-fp','x-rpc-platform':'4'})};
const result=data=>new Response(JSON.stringify({retcode:0,data}),{headers:{'Content-Type':'application/json'}});
const character=id=>({id,name:'测试角色',level_current:80,promote_level:6,skill_list:[{id:10001,group_id:11101,max_level:10,level_current:7}],reliquary_list:[]});
test('登录和后续接口使用同一设备标识，密码保持加密提交',async()=>{
 const calls=[],client=new AccountClient({device,fetchImpl:async(url,options)=>{calls.push(options);if(String(url).includes('loginByPassword')){
  const body=JSON.parse(options.body);assert.ok(body.account&&!options.body.includes('test-account'));assert.ok(body.password&&!options.body.includes('test-password'));
  return new Response(JSON.stringify({retcode:0}),{headers:{'Set-Cookie':'cookie_token=test-cookie; Secure; HttpOnly'}});
 }assert.equal(options.headers.Cookie,'cookie_token=test-cookie');return result({});}});
 await client.login('test-account','test-password');await client.request('https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie');
 assert.equal(calls[0].headers['x-rpc-device_id'],calls[1].headers['x-rpc-device_id']);assert.equal(calls[0].headers['x-rpc-device_fp'],'official-fp');
});
test('两名所需角色同步从10次减至7次，详情只读一次，第二次手动更新仍重新联网',async()=>{
 const calls=[],ids=[10000111,10000121];let batch=0;
 const client=new AccountClient({device,fetchImpl:async(url,options)=>{
  const target=new URL(url);calls.push(target.pathname);
  assert.equal(options.headers['x-rpc-device_id'],'stable-device');assert.equal(options.headers['x-rpc-device_fp'],'official-fp');
  if(target.pathname.includes('/e20200928calculate/')){assert.equal(options.headers['x-rpc-platform'],'4');assert.equal(options.headers.Referer,'https://act.mihoyo.com/ys/event/calculator/index.html');}
  if(target.pathname.endsWith('/getUserGameRolesByCookie'))return result({list:[{game_uid:'123',game_biz:'hk4e_cn',region:'cn_gf01'}]});
  if(target.pathname.endsWith('/dailyNote'))return result({current_resin:80});
  if(target.pathname.endsWith('/character/list'))return result({list:[...ids,10000030].map(id=>({id,name:'测试角色'}))});
  if(target.pathname.endsWith('/character/detail')){assert.deepEqual(JSON.parse(options.body).character_ids,ids);return result({list:ids.map(id=>({id}))});}
  if(target.pathname.endsWith('/sync/avatar/detail'))return result({avatar:character(Number(target.searchParams.get('avatar_id')))});
  if(target.pathname.endsWith('/batch_compute'))return result({has_user_info:true,overall_consume:[{id:202,name:'摩拉',num:100,lack_num:100-++batch}]});
  assert.fail('Unexpected request '+target.pathname);
 }});client.selectedCharacterIds=ids;
 const a=await client.refreshRaw();assert.equal(calls.length,7);assert.equal(a.syncDiagnostics.reusedCalculatorDetails,2);assert.equal(a.syncDiagnostics.gameApiRequests,7);assert.equal(a.inventory.available_material[0].num,1);
 const b=await client.refreshRaw();assert.equal(calls.length,14);assert.equal(b.inventory.available_material[0].num,2);assert.equal(calls.filter(p=>p.endsWith('/sync/avatar/detail')).length,4);
});
test('计算器验证后不会继续读取其他角色详情或库存，战绩验证后不再请求详情',async()=>{
 const paths=[],client=new AccountClient({device,fetchImpl:async url=>{
  const target=new URL(url);paths.push(target.pathname);
  if(target.pathname.endsWith('/getUserGameRolesByCookie'))return result({list:[{game_uid:'123',game_biz:'hk4e_cn',region:'cn_gf01'}]});
  if(target.pathname.endsWith('/dailyNote'))return result({current_resin:80});
  return new Response(JSON.stringify({retcode:target.pathname.includes('calculate')?10034:1034}));
 }});client.selectedCharacterIds=[10000111,10000121];
 const raw=await client.refreshRaw();assert.equal(paths.length,4);assert.equal(paths.filter(p=>p.endsWith('/sync/avatar/detail')).length,1);assert.ok(!paths.some(p=>p.endsWith('/batch_compute')||p.endsWith('/character/detail')));assert.equal(raw.errors.inventory.code,10034);assert.equal(raw.errors.details.code,1034);assert.equal(raw.notes.current_resin,80);
});
test('HTTP限流即使返回非JSON页面也停止后续计算器请求',async()=>{
 const client=new AccountClient({device,fetchImpl:async()=>new Response('Too many requests',{status:429})});
 await assert.rejects(client.request('https://api-takumi.mihoyo.com/event/e20200928calculate/v1/sync/avatar/detail'),error=>error.code===429);
});

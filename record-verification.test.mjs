import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRecordChallenge,submitRecordChallenge,recordChallengeHeaders} from './record-verification.mjs';
test('资源验证码使用官方战绩接口并保持路径、追踪标识和游戏 ID 一致',async()=>{
 const calls=[];const request=async(url,options)=>{calls.push({url,options});return calls.length===1?{gt:'gt',challenge:'challenge',new_captcha:true}:{challenge:'official-verified-token'};};
 const data=await createRecordChallenge(request,{path:'/app/genshin/api/dailyNote',trace:'request-trace'});
 const verified=await submitRecordChallenge(request,data.pending,{geetest_challenge:'challenge00',geetest_validate:'user-validation',geetest_seccode:'user-validation|jordan'});
 assert.equal(calls[0].url,'https://api-takumi-record.mihoyo.com/game_record/card/wapi/createVerification');assert.equal(calls[1].url,'https://api-takumi-record.mihoyo.com/game_record/card/wapi/verifyVerification');
 assert.deepEqual(calls[0].options.extraHeaders,calls[1].options.extraHeaders);assert.equal(calls[1].options.extraHeaders['x-rpc-challenge_game'],'2');assert.equal(calls[1].options.extraHeaders['x-rpc-challenge_trace'],'request-trace');assert.equal(verified.challenge,'official-verified-token');
});
test('不复用社区验证结果，不接受错配或过期的验证码',async()=>{
 assert.throws(()=>recordChallengeHeaders({path:'/misc/api/signIn'}));
 await assert.rejects(submitRecordChallenge(async()=>({}),{created:0},{}),/EXPIRED/);
 await assert.rejects(submitRecordChallenge(async()=>({challenge:'ok'}),{created:Date.now(),challenge:'one',headers:{}},{geetest_challenge:'other',geetest_validate:'v',geetest_seccode:'s'}),/WRONG_VERIFICATION_CHALLENGE/);
});

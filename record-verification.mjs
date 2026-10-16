// Matches the public official Battle Chronicle frontend's createVerify/verify flow.
export const RECORD_CARD='https://api-takumi-record.mihoyo.com/game_record/card/wapi/';
export function recordChallengeHeaders(blocked){
 if(!blocked||!blocked.path.startsWith('/app/genshin/api/'))throw new Error('NO_BLOCKED_RECORD_REQUEST');
 return {'x-rpc-challenge_game':'2','x-rpc-challenge_path':blocked.path,'x-rpc-challenge_trace':blocked.trace??'','x-rpc-page':'/ys'};
}
export async function createRecordChallenge(request,blocked){
 const headers=recordChallengeHeaders(blocked);
 const result=await request(RECORD_CARD+'createVerification',{query:{is_high:'true'},stage:'createRecordVerification',extraHeaders:headers});
 if(!result.gt||!result.challenge)throw new Error('MISSING_RECORD_CHALLENGE');
 return {public:{gt:result.gt,challenge:result.challenge,new_captcha:result.new_captcha??true},pending:{challenge:result.challenge,created:Date.now(),headers}};
}
export async function submitRecordChallenge(request,pending,result){
 if(!pending||Date.now()-pending.created>600000)throw new Error('VERIFICATION_EXPIRED');
 const body={};
 for(const key of ['geetest_challenge','geetest_validate','geetest_seccode']){if(typeof result[key]!=='string'||!result[key]||result[key].length>2048)throw new Error('INVALID_VERIFICATION_RESULT');body[key]=result[key];}
 if(!body.geetest_challenge.startsWith(pending.challenge))throw new Error('WRONG_VERIFICATION_CHALLENGE');
 const verified=await request(RECORD_CARD+'verifyVerification',{method:'POST',body,stage:'verifyRecordVerification',extraHeaders:pending.headers});
 if(typeof verified.challenge!=='string'||!verified.challenge)throw new Error('NO_VERIFIED_RECORD_CHALLENGE');
 return {challenge:verified.challenge};
}

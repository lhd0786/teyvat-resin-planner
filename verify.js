const status=document.querySelector('#verificationStatus'),button=document.querySelector('#beginVerification');
async function post(path,body={}){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
button.onclick=async()=>{
 button.disabled=true;status.textContent='正在向米游社请求本次验证码…';
 try{
  const mmt=await post('/api/account/challenge');
  if(mmt.kind==='calculator'){
   status.textContent='养成计算器需要独立验证，请亲自完成官方弹窗。';
   if(!window.miHoYoAccountSdk?.verifier?.geetest)throw new Error('官方账号验证组件未加载');
   window.miHoYoAccountSdk.verifier.geetest({ticket:mmt.ticket,onSuccess:async()=>{try{status.textContent='正在重试官方库存接口…';const result=await post('/api/account/verify',{kind:'calculator'}),inv=result.snapshot?.inventory,errors=Object.entries(result.snapshot?.errors??{}).map(([k,e])=>k+'：'+e.code);status.textContent=(inv?'已读取 '+inv.items.length+' 种材料库存。':'验证已提交，库存尚未读取成功。')+(errors.length?'仍待处理：'+errors.join('；'):'同步完成。')+' 请返回账号页面。';}catch(e){status.textContent='库存重试失败：'+e.message;}finally{button.disabled=false;}},onError:()=>{status.textContent='官方计算器验证未完成，请重试。';button.disabled=false;}});return;
  }
  if(typeof window.initGeetest!=='function')throw new Error('极验组件未能加载，请检查网络后刷新页面');
  window.initGeetest({gt:mmt.gt,challenge:mmt.challenge,new_captcha:mmt.new_captcha,product:'popup',offline:false,https:true,lang:'zh-cn',api_server:'api.geetest.com'},captcha=>{
   captcha.appendTo('#captchaContainer');status.textContent='请亲自完成下方验证码。';
   captcha.onSuccess(async()=>{try{status.textContent='正在向官方战绩接口提交验证并读取账号数据…';const result=await post('/api/account/verify',captcha.getValidate());const snapshot=result.snapshot,read=[];if(snapshot?.notes)read.push('实时树脂');if(snapshot?.characters)read.push(snapshot.characters.items.length+' 名角色现状');if(snapshot?.inventory)read.push('养成材料库存');const errors=Object.entries(snapshot?.errors??{}).map(([key,value])=>key+'：'+value.code);status.textContent=read.length?'已读取 '+read.join('、')+'。'+(errors.length?'仍待处理：'+errors.join('；'):'账号读取完成。')+' 请返回账号同步页面。':'官方验证结果已提交，但尚未取得资源数据。'+errors.join('；')+'。请保留此页以便继续排查。';}catch(error){status.textContent='提交失败：'+error.message;}finally{button.disabled=false;}});
   captcha.onError(error=>{status.textContent='极验组件资源加载失败，请刷新页面后重试；若仍失败请保留此页以便检查。';button.disabled=false;console.error('Verification component resource error',error);});
  });
 }catch(error){status.textContent='无法开始验证：'+error.message;button.disabled=false;}
};

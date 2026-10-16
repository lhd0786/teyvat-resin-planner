import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createAccountController} from './account-controller.mjs';
const root=path.resolve(fileURLToPath(new URL('.',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
export function createPlannerServer({accountClient}={}){const account=createAccountController(accountClient);return http.createServer(async(req,res)=>{
  try {
    const origin='http://'+req.headers.host;
    if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host??'')){res.writeHead(403).end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.startsWith('/api/account')){
     const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
     if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==origin){send(403,{error:'ORIGIN_DENIED'});return;}
     try{
      if(pathname==='/api/account'&&req.method==='GET'){send(200,await account.status());return;}
      if(req.method!=='POST'||!String(req.headers['content-type']).startsWith('application/json')){send(405,{error:'JSON_POST_REQUIRED'});return;}
      let text='';for await(const chunk of req){text+=chunk;if(text.length>8192){send(413,{error:'BODY_TOO_LARGE'});return;}}
      const body=JSON.parse(text||'{}');
      if(pathname==='/api/account/login')send(200,await account.login(body.username,body.password,body.characterIds));
      else if(pathname==='/api/account/refresh')send(200,await account.refresh({characterIds:body.characterIds}));
      else if(pathname==='/api/account/challenge')send(200,await account.challenge());
      else if(pathname==='/api/account/verify')send(200,await account.verify(body));
      else send(404,{error:'NOT_FOUND'});
     }catch(error){send(400,{error:error.code??(['SESSION_REQUIRED'].includes(error.message)?error.message:'ACCOUNT_REQUEST_FAILED'),stage:error.stage??null});}return;
    }
    if(req.method!=='GET'){res.writeHead(405).end();return;}
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)&&file!==path.join(root,'index.html')){res.writeHead(403).end();return;}
    if(!['index.html','app.js','planner.js','catalog.js','catalog-ui.js','account-model.js','account-ui.js','verify.html','verify.js','style.css','example.json','data/catalog.json'].includes(path.relative(root,file).replaceAll('\\','/'))){res.writeHead(404).end();return;}
    const content=await readFile(file);
    const policy=pathname==='/verify.html'?"default-src 'self'; script-src 'self' https://*.geetest.com https://*.geevisit.com https://webstatic.mihoyo.com https://*.miyoushe.com; style-src 'self' 'unsafe-inline' https://*.geetest.com https://*.geevisit.com; font-src 'self' data: https://*.geetest.com https://*.geevisit.com; img-src 'self' data: https://*.geetest.com https://*.geevisit.com; media-src https://*.geetest.com https://*.geevisit.com; connect-src 'self' https://*.geetest.com https://*.geevisit.com https://*.mihoyo.com https://*.miyoushe.com; frame-src https://*.geetest.com https://*.geevisit.com https://*.mihoyo.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'":"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':policy});res.end(content);
  }catch{res.writeHead(404).end('Not found');}
});}
function openBrowser(url){
  return new Promise(resolve=>{
   const args=['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference = 'Stop'; Start-Process -FilePath '${url}'`];
   const child=spawn('powershell.exe',args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
   let details='';child.stderr.on('data',chunk=>{details+=chunk.toString();});
   child.once('error',error=>{console.error('Could not open the browser: '+error.message);console.log('Please open: '+url);resolve();});
   child.once('close',code=>{if(code!==0){console.error('Could not open the browser. '+details.trim());console.log('Please open: '+url);}else console.log('Browser requested. If no page appears, open: '+url);resolve();});
  });
}
export async function startPlanner({port=17840,open=false,accountClient}={}){
 const server=createPlannerServer({accountClient});
 return new Promise((resolve,reject)=>{
  server.once('error',async error=>{
   if(error.code!=='EADDRINUSE'){reject(error);return;}
   const url=`http://127.0.0.1:${port}`;
   try{
    const response=await fetch(url+'/',{signal:AbortSignal.timeout(3000),redirect:'error'});
    const html=await response.text();
    if(!response.ok||!html.includes('<title>旅人手记 · 树脂规划</title>')||!html.includes('id="profileForm"'))throw new Error('Different service');
    console.log('Planner is already running. Reusing: '+url);
    if(open)await openBrowser(url);
    resolve({mode:'reused',url,server:null});
   }catch{
    reject(new Error(`Port ${port} is occupied by another service or is not responding. No process was stopped. Close that service and try again.`));
   }
  });
  server.listen(port,'127.0.0.1',async()=>{
   const url=`http://127.0.0.1:${server.address().port}`;
   console.log('Local: '+url);if(open)await openBrowser(url);
   resolve({mode:'started',url,server});
  });
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 startPlanner({open:process.argv.includes('--open')}).catch(error=>{
  console.error(error.message);process.exitCode=1;
 });
}

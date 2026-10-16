import {readFile,mkdir,writeFile,rename,stat} from 'node:fs/promises';
import {normalizeAccount,mergeAccount} from './account-model.js';
import {AccountClient} from './account-client.mjs';
const file=new URL('.private/account.json',import.meta.url),temp=new URL('.private/account.tmp',import.meta.url);
export function createAccountController(client){
 let snapshot=client?.lastRaw?normalizeAccount(client.lastRaw):null,inFlight=null,lastRefresh=0;
 const loaded=(async()=>{if(!snapshot)try{snapshot=JSON.parse(await readFile(file,'utf8'));}catch{}return snapshot;})();
 async function persist(){await mkdir(new URL('.private/',import.meta.url),{recursive:true});await writeFile(temp,JSON.stringify(snapshot));await rename(temp,file);}
 return {
  async status(){await loaded;return {schemaRevision:2,sessionActive:!!client,snapshot};},
  async login(username,password,characterIds=[]){
   if(typeof username!=='string'||typeof password!=='string'||!username||!password||username.length>200||password.length>500)throw new Error('INVALID_LOGIN_INPUT');
   const nextClient=new AccountClient();await nextClient.login(username,password);client=nextClient;lastRefresh=0;return this.refresh({force:true,characterIds});
  },
  async refresh({force=false,characterIds}={}){
   if(characterIds!==undefined){if(!Array.isArray(characterIds)||characterIds.length>120||characterIds.some(id=>!Number.isInteger(id)||id<10000000||id>19999999))throw new Error('INVALID_CHARACTER_IDS');if(client)client.selectedCharacterIds=[...new Set(characterIds)];}
   await loaded;if(!client)throw new Error('SESSION_REQUIRED');if(inFlight)return inFlight;if(!force&&Date.now()-lastRefresh<60000)return {schemaRevision:2,sessionActive:true,snapshot};
   client.fallbackCharacters=snapshot?.characters?{uid:snapshot.role.uid,region:snapshot.role.region,ids:snapshot.characters.items.map(c=>c.id)}:null;
   lastRefresh=Date.now();inFlight=(async()=>{try{const raw=await client.refreshRaw(),modelURL=new URL('account-model.js',import.meta.url),info=await stat(modelURL),model=await import(modelURL.href+'?revision='+info.mtimeMs),next=model.normalizeAccount(raw);snapshot=model.mergeAccount(snapshot,next);await persist();return {schemaRevision:2,sessionActive:true,snapshot};}finally{inFlight=null;}})();return inFlight;
  },
  async challenge(){if(!client)throw new Error('SESSION_REQUIRED');return client.createChallenge();},
  async verify(result){if(!client)throw new Error('SESSION_REQUIRED');await client.submitChallenge(result);return this.refresh({force:true});}
 };
}

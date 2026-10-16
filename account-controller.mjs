import {readFile,mkdir,writeFile,rename,stat} from 'node:fs/promises';
import {normalizeAccount,mergeAccount} from './account-model.js';
import {AccountClient} from './account-client.mjs';
const file=new URL('.private/account.json',import.meta.url),temp=new URL('.private/account.tmp',import.meta.url);
export function createAccountController(client,{readSnapshot=async()=>JSON.parse(await readFile(file,'utf8')),writeSnapshot=async value=>{await mkdir(new URL('.private/',import.meta.url),{recursive:true});await writeFile(temp,JSON.stringify(value));await rename(temp,file);}}={}){
 let snapshot=client?.lastRaw?normalizeAccount(client.lastRaw):null,refreshQueue=Promise.resolve();
 const loaded=(async()=>{if(!snapshot)try{snapshot=await readSnapshot();}catch{}return snapshot;})();
 return {
  async status(){await loaded;return {schemaRevision:3,syncImplementation:'seelieex-adapted',sessionActive:!!client,snapshot,networkRefreshed:false};},
  async login(username,password,characterIds=[]){
   if(typeof username!=='string'||typeof password!=='string'||!username||!password||username.length>200||password.length>500)throw new Error('INVALID_LOGIN_INPUT');
   const nextClient=new AccountClient();await nextClient.login(username,password);await refreshQueue;client=nextClient;return this.refresh({characterIds});
  },
  async refresh({characterIds}={}){
   if(characterIds!==undefined&&(!Array.isArray(characterIds)||characterIds.length>120||characterIds.some(id=>!Number.isInteger(id)||id<10000000||id>19999999)))throw new Error('INVALID_CHARACTER_IDS');
   const ids=characterIds===undefined?undefined:[...new Set(characterIds)];
   const run=async()=>{
    await loaded;if(!client)throw new Error('SESSION_REQUIRED');if(ids!==undefined)client.selectedCharacterIds=ids;
    client.fallbackCharacters=snapshot?.characters?{uid:snapshot.role.uid,region:snapshot.role.region,ids:snapshot.characters.items.map(c=>c.id)}:null;
    const raw=await client.refreshRaw(),modelURL=new URL('account-model.js',import.meta.url),info=await stat(modelURL),model=await import(modelURL.href+'?revision='+info.mtimeMs),next=model.normalizeAccount(raw);snapshot=model.mergeAccount(snapshot,next);await writeSnapshot(snapshot);return {schemaRevision:3,sessionActive:true,snapshot,networkRefreshed:true,failedSections:Object.keys(raw.errors??{}),updatedSections:['notes','characters','details','calculatorCharacters','inventory'].filter(key=>raw[key]!=null)};
   };
   const pending=refreshQueue.then(run);refreshQueue=pending.catch(()=>{});return pending;
  },
  async challenge(){if(!client)throw new Error('SESSION_REQUIRED');return client.createChallenge();},
  async verify(result){if(!client)throw new Error('SESSION_REQUIRED');await client.submitChallenge(result);return this.refresh({force:true});}
 };
}

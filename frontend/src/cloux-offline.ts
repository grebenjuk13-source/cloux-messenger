/** CLOUX per-user offline cache. Does not replace server as source of truth. */
type Stored={id:string;data:unknown;updated:number};
const VERSION=1,DB='cloux-offline-v1',TABLE='messages';
function openDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,VERSION);
  req.onupgradeneeded=()=>{const database=req.result;if(!database.objectStoreNames.contains(TABLE))database.createObjectStore(TABLE,{keyPath:'id'})};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
const safeId=(x:string)=>x.replace(/[^A-Za-z0-9_-]/g,'').slice(0,88);
const key=(userId:string,chatId:string)=>safeId(userId)+':'+safeId(chatId);
export async function readOffline<T>(userId:string,chatId:string):Promise<T|null>{
 if(!('indexedDB'in window))return null;
 let db:IDBDatabase|null=null;
 try{db=await openDb();const value=await new Promise<Stored|undefined>((resolve,reject)=>{const r=db!.transaction(TABLE,'readonly').objectStore(TABLE).get(key(userId,chatId));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return (value?.data as T)||null}catch{return null}finally{db?.close()}
}
export async function cacheOffline<T>(userId:string,chatId:string,data:T):Promise<void>{
 if(!('indexedDB'in window))return;
 let db:IDBDatabase|null=null;
 try{
  db=await openDb();
  const item:Stored={id:key(userId,chatId),data,updated:Date.now()};
  await new Promise<void>((resolve,reject)=>{const tr=db!.transaction(TABLE,'readwrite');tr.objectStore(TABLE).put(item);tr.oncomplete=()=>resolve();tr.onerror=()=>reject(tr.error)});
 }catch{/* Cache errors cannot block sending messages. */}finally{db?.close()}
}
export async function clearOffline(userId:string){
 let db:IDBDatabase|null=null;
 try{db=await openDb();const tr=db.transaction(TABLE,'readwrite'),store=tr.objectStore(TABLE),req=store.openCursor();
  req.onsuccess=()=>{const c=req.result;if(!c)return;if(String(c.key).startsWith(safeId(userId)+':'))c.delete();c.continue()};
 }catch{}finally{db?.close()}
}

/** Shared Cloux state, API, emoji rendering, and browser persistence. */
export const BASE_AVATAR='/assets/cloux-default-avatar.jpg';
export const S={me:null,profile:null,prefs:{},local:{},chats:[],current:null,messages:[],server:null,reads:{},reactions:{},tab:'chats',filter:'all',reply:null,emojiOpen:false};
export const $=(selector,root=document)=>root.querySelector(selector);
export const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const ago=ts=>!ts?'':new Date(ts*1000).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
export function toast(message){let el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3000)}
export async function api(path,{method='GET',body=null,headers={}}={}){
 const response=await fetch(path,{method,credentials:'same-origin',headers:{...(body!=null&&typeof body==='string'?{'Content-Type':'application/json'}:{}),...headers},body});
 let data;try{data=await response.json()}catch{data={detail:'Сервер не відповідає'}};
 if(!response.ok)throw new Error(data.detail||'Помилка '+response.status);
 return data;
}
export const post=(path,obj={})=>api(path,{method:'POST',body:JSON.stringify(obj)});
export const patch=(path,obj={})=>api(path,{method:'PATCH',body:JSON.stringify(obj)});
export function localKey(){return 'cloux-modern-'+(S.me?.id||'guest')}
export function loadLocal(){try{return JSON.parse(localStorage.getItem(localKey())||'{}')}catch{return {}}}
export function saveLocal(delta){S.local={...S.local,...delta};localStorage.setItem(localKey(),JSON.stringify(S.local))}
export function renderEmoji(root=document){
 // Twemoji is served as a separate uniform image set, never platform emoji glyphs.
 if(window.twemoji){window.twemoji.parse(root,{folder:'svg',ext:'.svg',base:'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/'});}
}
export const EMOJIS={
 'Нещодавні':[], 'Обличчя':['😀','😄','😁','😅','😂','🤣','🥹','😊','😍','🥰','😘','😎','🤩','🥳','🥺','😢','😭','😡','🤔','🫣','😴','🥶','👻','💀','🤖'],
 'Жести':['👍','👎','👏','🙌','🙏','🤝','🫶','👋','👌','✌️','🤞','💪','👀','🫡','☝️','💯'],
 'Серця':['❤️','🤍','🖤','💙','💚','💜','💛','🩷','💔','💕','💖','💗','💘'],
 'Тварини':['🐈','🐶','🐱','🐼','🦊','🐸','🐧','🐣','🐹','🦄','🐉','🦋','🐝','🌸','🌹'],
 'Предмети':['🔥','⭐','✨','🎉','🎁','🎮','📱','💬','📎','📸','🎵','🏆','⚡','💎','🌈','🕊️']
};
export const RECENT_KEY='cloux-emoji-recent';
export function recentEmoji(){try{return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]').slice(0,32)}catch{return []}}
export function rememberEmoji(value){let r=recentEmoji().filter(x=>x!==value);r.unshift(value);localStorage.setItem(RECENT_KEY,JSON.stringify(r.slice(0,32)))}
export function shortText(t){return String(t||'').slice(0,150)}
export function makeAvatar(url=BASE_AVATAR,size=''){
 // Default image's actual pixels are never modified. Only CSS clips it to a circle.
 const img=document.createElement('img');img.src=url;img.alt='Аватар';img.className='avatar '+size;img.onerror=()=>{img.onerror=null;img.src=BASE_AVATAR};return img;
}
export function withError(fn){return async(...args)=>{try{await fn(...args)}catch(err){toast(err.message||String(err))}}}
export function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('cloux-media-cache',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('photos'))r.result.createObjectStore('photos')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function cachedPhoto(key){try{const db=await openDb();return await new Promise((resolve,reject)=>{const req=db.transaction('photos').objectStore('photos').get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}catch{return null}}
export async function cachePhoto(key,data){const db=await openDb();return new Promise((resolve,reject)=>{const req=db.transaction('photos','readwrite').objectStore('photos').put(data,key);req.onsuccess=resolve;req.onerror=()=>reject(req.error)})}

export async function deleteCachedPhoto(key){const db=await openDb();return new Promise((resolve,reject)=>{const req=db.transaction('photos','readwrite').objectStore('photos').delete(key);req.onsuccess=resolve;req.onerror=()=>reject(req.error)})}
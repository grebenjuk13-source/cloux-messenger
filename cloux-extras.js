/* CLOUX utilities: all local options are labeled as local; server session operations use authenticated endpoints. */
(function(){
'use strict';
const $=(q,r=document)=>r.querySelector(q);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=(k,alt='')=>{try{return localStorage.getItem('cloux:extras:'+k)||alt}catch{return alt}};
const put=(k,value)=>{try{localStorage.setItem('cloux:extras:'+k,String(value))}catch{}};
const decode=(k,fall)=>{try{return JSON.parse(get(k,'null'))||fall}catch{return fall}};
const saveJSON=(data,name)=>{const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000)};
let modal=null,privacyTimeout=0,locking=false,hiddenAt=null;
function close(){modal?.remove();modal=null}
function open(title,html){
 close();modal=document.createElement('div');modal.className='cloux-global-layer';modal.innerHTML='<section class="cloux-modal" role="dialog" aria-modal="true" aria-label="'+title+'"><button class="cloux-close" aria-label="Закрити" id="ex-close">✕</button><h2>'+title+'</h2>'+html+'</section>';document.body.append(modal);
 $('#ex-close',modal).onclick=close;modal.addEventListener('mousedown',e=>{if(e.target===modal)close()});
}
const status=s=>{const e=$('.cloux-status',modal);if(e)e.textContent=s};
async function api(path,options={}){
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
 const result=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(result.detail||'HTTP '+r.status);return result;
}
function palette(){
 open('Командна палітра','<label>Знайти команду<input id="ex-search" type="text" placeholder="Чати, теми, профіль, пам’ять…"></label><div id="ex-commands"></div><p class="cloux-status"></p>');
 const commands=[
 ['Чати — перейти до списку',()=>{const b=document.querySelector('[aria-label="Чати"]');b?.click();close()}],
 ['Теми Cloux',()=>window.ClouxCustomize?.themePanel?.()],
 ['Редактор профілю',()=>window.ClouxCustomize?.profilePanel?.()],
 ['Швидкі відповіді',quickReplies],
 ['Власні стікери',stickers],
 ['Статистика активності',()=>void stats()],
 ['Сеанси й пристрої',()=>void sessions()],
 ['Пам’ять та резервна копія',()=>void memory()],
 ['Не турбувати',dnd],
 ['PIN-блокування',pinSettings],
 ['Сайт завантаження',()=>location.href='/download']
 ];
 function draw(){
  const q=$('#ex-search',modal).value.toLowerCase();
  $('#ex-commands',modal).innerHTML=commands.map((c,i)=>[c,i]).filter(([c])=>c[0].toLowerCase().includes(q)).map(([c,i])=>'<button class="row" style="width:100%;text-align:left" data-ex="'+i+'">'+esc(c[0])+'</button>').join('')||'<p>Команд не знайдено</p>';
  modal.querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>{const fn=commands[Number(b.dataset.ex)][1];close();fn()});
 }
 $('#ex-search',modal).oninput=draw;draw();$('#ex-search',modal).focus();
}
function quickReplies(){
 const replies=decode('replies',['Привіт! 👋','Дякую, напишу пізніше.','Зараз не можу відповісти.']);
 open('Швидкі відповіді','<p>Локальні шаблони. Натисни фразу, щоб вставити в поточне повідомлення.</p><div id="ex-list"></div><label>Нова фраза<input type="text" id="ex-new" maxlength="240"></label><button class="primary" id="ex-add">Додати</button><p class="cloux-status"></p>');
 function draw(){
  $('#ex-list',modal).innerHTML=replies.map((x,i)=>'<div class="cloux-flex"><button data-paste="'+i+'">'+esc(x)+'</button><button data-remove="'+i+'">✕</button></div>').join('');
  modal.querySelectorAll('[data-paste]').forEach(el=>el.onclick=()=>{
   const field=document.querySelector('input[aria-label="Напиши повідомлення"]');
   if(!field){status('Відкрий чат, щоб вставити фразу');return}
   const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
   set.call(field,replies[Number(el.dataset.paste)]);field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();close();
  });
  modal.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{replies.splice(Number(el.dataset.remove),1);put('replies',JSON.stringify(replies));draw()});
 }
 draw();$('#ex-add',modal).onclick=()=>{const value=$('#ex-new',modal).value.trim();if(value&&!replies.includes(value)){replies.push(value);put('replies',JSON.stringify(replies));$('#ex-new',modal).value='';draw()}};
}
function stickers(){
 let stickers=decode('stickers',[]);
 open('Мої стікери','<p>Власні стікери з фото (до 2 МБ кожен). Зберігаються на цьому пристрої. Надсилання використовує серверну функцію файлів.</p><input id="st-input" type="file" accept="image/png,image/jpeg,image/webp"><div id="st-list" class="cloux-grid"></div><p class="cloux-status"></p>');
 function draw(){
  $('#st-list',modal).innerHTML=stickers.map((x,i)=>'<div class="cloux-section"><img alt="Стікер" src="'+x+'" style="width:100%;height:112px;object-fit:contain"><div class="cloux-flex"><button data-st-send="'+i+'">Надіслати</button><button data-st-delete="'+i+'">Видалити</button></div></div>').join('')||'<p>Ще немає власних стікерів</p>';
  modal.querySelectorAll('[data-st-delete]').forEach(b=>b.onclick=()=>{stickers.splice(Number(b.dataset.stDelete),1);put('stickers',JSON.stringify(stickers));draw()});
  modal.querySelectorAll('[data-st-send]').forEach(b=>b.onclick=async()=>{
   const input=document.querySelector('input[type=file][accept*="video"]');
   if(!input){status('Відкрий чат, щоб надіслати стікер');return}
   try{const res=await fetch(stickers[Number(b.dataset.stSend)]);const blob=await res.blob();
    const file=new File([blob],'cloux-sticker.webp',{type:'image/webp'}),dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));close();
   }catch(e){status('Не вдалося надіслати стікер: '+e.message)}
  });
 }
 draw();$('#st-input',modal).onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>2*1024*1024||!file.type.startsWith('image/')){status('Потрібне зображення до 2 МБ');return}
  try{
   const url=URL.createObjectURL(file),img=new Image();img.src=url;await img.decode();
   const c=document.createElement('canvas');c.width=c.height=350;const ctx=c.getContext('2d');
   const scale=Math.min(350/img.width,350/img.height);ctx.drawImage(img,(350-img.width*scale)/2,(350-img.height*scale)/2,img.width*scale,img.height*scale);
   const data=c.toDataURL('image/webp',.78);URL.revokeObjectURL(url);
   stickers.push(data);if(stickers.length>20)stickers=stickers.slice(-20);
   put('stickers',JSON.stringify(stickers));draw();
  }catch{status('Файл не вдалося відкрити')}
 };
}
async function stats(){
 open('Активність Cloux','<p>Кількість повідомлень з доступних тобі чатів (до 200 останніх повідомлень на чат).</p><div id="ex-stats">Отримуємо дані…</div><p class="cloux-status"></p>');
 const container=$('#ex-stats',modal);
 try{
  const data=await api('/api/chats');const chats=(data.chats||[]).slice(0,14);
  let counts=Array(7).fill(0),total=0;
  await Promise.all(chats.map(async chat=>{
   const x=await api('/api/chats/'+encodeURIComponent(chat.id)+'/messages');
   for(const msg of x.messages||[]){
    const days=Math.floor((Date.now()/1000-msg.created)/86400);
    if(days>=0&&days<7){counts[6-days]++;total++}
   }
  }));
  const max=Math.max(...counts,1);container.innerHTML='<p>Повідомлень за 7 днів: <b>'+total+'</b></p><div class="cloux-flex" style="height:155px;align-items:flex-end;gap:10px">'+counts.map((n,i)=>'<div style="flex:1;text-align:center"><div style="height:'+Math.max(5,120*n/max)+'px;background:linear-gradient(#ff4a5f,#7c0714);border-radius:8px 8px 2px 2px" title="'+n+' повідомлень"></div><small>'+['-6','-5','-4','-3','-2','-1','0'][i]+' дн.</small></div>').join('')+'</div>';
 }catch(e){if(container)container.textContent='Не вдалося завантажити статистику: '+e.message}
}
async function sessions(){
 open('Сеанси й пристрої','<div id="ex-devices">Перевіряємо сервер…</div><button id="ex-revoke">Завершити інші сеанси</button><p class="cloux-status"></p>');
 try{const data=await api('/api/devices');$('#ex-devices',modal).textContent='Активних серверних сеансів: '+data.sessions+'. Деталі пристроїв сервер наразі не зберігає.'}
 catch(e){status(e.message)}
 $('#ex-revoke',modal).onclick=async()=>{
  if(!confirm('Завершити інші сеанси цього акаунта?'))return;
  try{await api('/api/devices/revoke-others',{method:'POST'});status('Інші сеанси завершено');$('#ex-devices',modal).textContent='Активний цей сеанс'}catch(e){status(e.message)}
 };
}
async function memory(){
 open('Пам’ять та копія даних','<p>Експорт справжніх чатів доступний власнику акаунта; відновлення серверних повідомлень потребує окремого імпорту на сервері. Налаштування можна імпортувати локально.</p><div id="ex-storage">Перевіряємо сховище…</div><div class="cloux-tools"><button id="ex-export" class="primary">Експорт даних JSON</button><button id="ex-import">Імпорт налаштувань</button><button id="ex-clear">Очистити кеш Cloux</button><input id="ex-import-file" type="file" accept="application/json" hidden></div><p class="cloux-status"></p>');
 navigator.storage?.estimate?.().then(x=>{if($('#ex-storage',modal))$('#ex-storage',modal).textContent='Локально використано: '+((x.usage||0)/1024/1024).toFixed(1)+' МБ'}).catch(()=>{});
 $('#ex-export',modal).onclick=async()=>{
  try{
   status('Отримуємо твої чати…');const data=await api('/api/chats');
   const groups=await Promise.all((data.chats||[]).map(async c=>({chat:c,messages:(await api('/api/chats/'+encodeURIComponent(c.id)+'/messages')).messages||[]})));
   const settings={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('cloux:')&&!key.includes('session'))settings[key]=localStorage.getItem(key)}
   saveJSON({format:'cloux-export-1',at:new Date().toISOString(),chats:groups,settings},'Cloux-export.json');
   status('Дані експортовані. Бережи файл — він містить приватні повідомлення.');
  }catch(e){status(e.message)}
 };
 $('#ex-import',modal).onclick=()=>$('#ex-import-file',modal).click();
 $('#ex-import-file',modal).onchange=async e=>{
  const f=e.target.files?.[0];if(!f||f.size>10*1024*1024){status('Завеликий або відсутній файл');return}
  try{const data=JSON.parse(await f.text());if(data.format!=='cloux-export-1'||typeof data.settings!=='object')throw Error('Невідомий формат');
   for(const [key,value] of Object.entries(data.settings)){if(key.startsWith('cloux:')&&typeof value==='string'&&!key.includes('session'))localStorage.setItem(key,value)}
   status('Налаштування відновлено. Повідомлення на сервері не змінено. Онови сторінку.');
  }catch(e){status(e.message)}
 };
 $('#ex-clear',modal).onclick=async()=>{
  if(!confirm('Очистити офлайн-кеш застосунку (не чати й не акаунт)?'))return;
  const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('cloux-shell')).map(k=>caches.delete(k)));status('Кеш очищений, чати не видалені');
 };
}
function dnd(){
 open('Не турбувати','<p>Розклад для цього пристрою. Серверні та системні сповіщення інших пристроїв не змінюються.</p><div class="cloux-grid"><label>Від<input id="dnd-from" type="time" value="'+get('dnd-from','22:00')+'"></label><label>До<input id="dnd-to" type="time" value="'+get('dnd-to','08:00')+'"></label></div><label><input id="dnd-enabled" type="checkbox" '+(get('dnd-enabled')==='1'?'checked':'')+'> Увімкнути локально</label><button class="primary" id="dnd-save">Зберегти</button><p class="cloux-status"></p>');
 $('#dnd-save',modal).onclick=()=>{for(const k of ['from','to'])put('dnd-'+k,$('#dnd-'+k,modal).value);put('dnd-enabled',$('#dnd-enabled',modal).checked?'1':'0');status('Локальний розклад збережено')};
}
async function digestPin(pin,salt){
 const bytes=new TextEncoder().encode(pin);
 const key=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new Uint8Array(salt.match(/../g).map(x=>parseInt(x,16))),iterations:120000,hash:'SHA-256'},key,256);
 return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function pinSettings(){
 open('Локальний PIN Cloux','<p>PIN блокує вікно лише на цьому пристрої. Це не двофакторна авторизація сервера.</p><label>Новий PIN (4–8 цифр)<input id="pin-new" type="password" inputmode="numeric" maxlength="8"></label><div class="cloux-tools"><button class="primary" id="pin-set">Встановити PIN</button><button id="pin-lock">Заблокувати зараз</button><button id="pin-remove">Вимкнути PIN</button></div><p class="cloux-status"></p>');
 $('#pin-set',modal).onclick=async()=>{
  const value=$('#pin-new',modal).value;if(!/^\d{4,8}$/.test(value)){status('PIN: лише 4–8 цифр');return}
  const salt=Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x=>x.toString(16).padStart(2,'0')).join('');
  put('pin-salt',salt);put('pin-hash',await digestPin(value,salt));$('#pin-new',modal).value='';status('PIN установлено на цьому пристрої');
 };
 $('#pin-lock',modal).onclick=()=>lock();
 $('#pin-remove',modal).onclick=async()=>{
  const old=prompt('Введи поточний PIN');if(old===null)return;
  if(await digestPin(old,get('pin-salt'))!==get('pin-hash')){status('PIN неправильний');return}
  localStorage.removeItem('cloux:extras:pin-salt');localStorage.removeItem('cloux:extras:pin-hash');status('PIN вимкнений');
 };
}
function lock(){
 if(!get('pin-hash')||locking)return;close();locking=true;
 const bg=document.createElement('div');bg.className='cloux-global-layer';bg.id='ex-lock';bg.style.zIndex='100000';
 bg.innerHTML='<section class="cloux-modal" style="max-width:390px;text-align:center"><h2>🔒 Cloux заблоковано</h2><p>Введи локальний PIN</p><input id="ex-pin-enter" type="password" inputmode="numeric" maxlength="8" autocomplete="off" aria-label="PIN"><button class="primary" id="ex-unlock">Розблокувати</button><p class="cloux-status"></p></section>';
 document.body.append(bg);$('#ex-unlock',bg).onclick=async()=>{
  const value=$('#ex-pin-enter',bg).value;
  if(await digestPin(value,get('pin-salt'))===get('pin-hash')){bg.remove();locking=false}
  else{$('.cloux-status',bg).textContent='Неправильний PIN';$('#ex-pin-enter',bg).value=''}
 };
 $('#ex-pin-enter',bg).onkeydown=e=>{if(e.key==='Enter')$('#ex-unlock',bg).click()};
 $('#ex-pin-enter',bg).focus();
}
function addMenu(){
 const host=$('.settings-view');if(!host||$('#cloux-extras-open'))return;
 const b=document.createElement('button');b.id='cloux-extras-open';b.className='cloux-profile-launch';b.textContent='⌘ Інструменти Cloux • стікери • резервна копія';
 b.onclick=palette;const anchor=$('#cloux-profile-tools',host);if(anchor)anchor.after(b);else host.prepend(b);
}
function setup(){
 const root=$('#root');if(root){
  let timer=0;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(addMenu,300)}).observe(root,{childList:true,subtree:true});
 }
 addMenu();
 document.addEventListener('cloux:open-tools',palette);
 window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();palette()}},{capture:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else if(hiddenAt&&Date.now()-hiddenAt>30000&&get('pin-hash'))lock()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
window.ClouxExtras={palette,quickReplies,stickers,stats,sessions,memory,dnd,pinSettings,lock};
})();
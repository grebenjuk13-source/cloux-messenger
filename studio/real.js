/* CLOUX — authenticated browser messenger. Source of truth: server APIs, never generated chats.
 * No password/session tokens are stored in localStorage.
 * All writes go to Cloux API; failed writes are shown as errors, never faked.
 */
(() => {
'use strict';
const $=(q,root=document)=>root.querySelector(q);
const $$=(q,root=document)=>[...root.querySelectorAll(q)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avatar='/assets/cloux-default-avatar.jpg';
let me=null,profile=null,chats=[],active=null,messages=[],reactions={},filter='all',q='',reply=null,editing=null,wsChat=null,wsInbox=null,typingTimer=0;
let syncTimer=0,chatTimer=0,toastTimer=0,authView='login',reconnecting=false,selectedMsg=null,pref={},lastIncomingCall='';
const drafts={};try{Object.assign(drafts,JSON.parse(sessionStorage.getItem('cloux:live:drafts')||'{}'))}catch{}
const formatTime=ts=>ts?new Date(ts*1000).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'}):'';
const activeChat=()=>chats.find(c=>c.id===active);
const nameOf=c=>c.title||'Невідомий чат';
const token=()=>Math.random().toString(36).slice(2);
const messagesHash=()=>messages.map(m=>m.id+':'+m.text).join('|');
const notify=message=>{
 const t=$('#toast');if(!t)return;
 t.textContent=String(message);t.classList.add('show');clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>t.classList.remove('show'),3300);
};
async function request(path,{method='GET',body,headers={},raw=false}={}){
 let options={method,credentials:'same-origin',cache:'no-store',headers:{...headers}};
 if(body!==undefined){if(raw){options.body=body}else{options.body=JSON.stringify(body);options.headers['Content-Type']='application/json'}}
 let response;try{response=await fetch(path,options)}catch{throw Error('Немає з’єднання із сервером. Перевір інтернет.')}
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  if(response.status===401&&me&&path!=='/api/me'){me=null;stopRealtime();showAuth()}
  throw Error(data?.detail||('Помилка сервера '+response.status));
 }
 return data;
}
function loading(text='Завантажуємо чати…'){
 $('#chat-list').innerHTML='<p class="empty-note" style="padding:23px;color:var(--text-dim)">'+esc(text)+'</p>';
}
function showAuth(mode='login'){
 authView=mode;$('#shell').classList.add('signed-out');
 let root=$('#cloux-auth');
 if(!root){root=document.createElement('div');root.id='cloux-auth';root.className='cloux-auth';document.body.append(root)}
 root.hidden=false;
 root.innerHTML='<div class="auth-card"><img src="'+avatar+'" alt="Cloux" class="auth-avatar"><h1>Cloux<span style="color:var(--hot)">.</span></h1>'+
 '<p>Справжні користувачі, чати та повідомлення. Увійди або зареєструй акаунт.</p>'+
 '<div class="auth-tabs"><button id="auth-login" class="'+(mode==='login'?'selected':'')+'">Увійти</button><button id="auth-register" class="'+(mode==='register'?'selected':'')+'">Реєстрація</button></div>'+
 '<form id="auth-form">'+(mode==='register'?'<label>Ім’я<input name="display" required maxlength="48" autocomplete="name" placeholder="Твоє ім’я"></label><label>Позивний<input name="username" required maxlength="32" pattern="[a-zA-Z0-9_]{3,32}" placeholder="Наприклад, cloux_user"></label><label>Номер телефону<input type="tel" name="phone" required minlength="7" maxlength="24" autocomplete="tel" placeholder="+380…"></label><label>Електронна пошта<input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>':
 '<label>Пошта або телефон<input type="text" name="identifier" required autocomplete="username" placeholder="you@example.com або +380…"></label>')+
 '<label>Пароль Cloux<input type="password" name="password" required minlength="'+(mode==='register'?8:1)+'" autocomplete="'+(mode==='register'?'new-password':'current-password')+'" placeholder="Пароль"></label>'+
 '<button class="auth-submit" type="submit">'+(mode==='register'?'Створити акаунт':'Увійти в Cloux')+'</button><p id="auth-error" class="auth-error" role="alert"></p></form>'+
 '<small>Пароль використовується тільки для входу на сервер Cloux. Ця сторінка не зберігає його.</small></div>';
 $('#auth-login').onclick=()=>showAuth('login');$('#auth-register').onclick=()=>showAuth('register');
 $('#auth-form').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget;const button=form.querySelector('button[type=submit]');
  const fields=Object.fromEntries(new FormData(form).entries());button.disabled=true;$('#auth-error').textContent='';
  try{
   const body=mode==='login'?{identifier:fields.identifier,password:fields.password}:fields;
   await request(mode==='register'?'/api/v6/register':'/api/v6/login',{method:'POST',body});
   await authenticate();
  }catch(err){$('#auth-error').textContent=err.message||'Не вдалося ввійти'}
  finally{button.disabled=false}
 };
}
async function authenticate(){
 me=await request('/api/me');const root=$('#cloux-auth');if(root)root.hidden=true;
 $('#shell').classList.remove('signed-out');try{profile=(await request('/api/profile')).profile}catch{profile={display:me.display,username:me.username}}
 $('#welcome').hidden=false;$('#chat-view').hidden=true;$('#shell').classList.remove('chat-open');
 await loadChats();connectInbox();startPolling();
 const join=new URL(location.href).searchParams.get('join');
 if(join){try{const joined=await request('/api/invites/'+encodeURIComponent(join)+'/join',{method:'POST'});history.replaceState({},'',location.pathname);await loadChats();await openChat(joined.chat_id);notify('Ти приєднався до чату')}catch(err){notify('Запрошення: '+err.message)}}
 notify('Вітаємо у Cloux, '+me.display);
}
async function initialize(){
 $('#chat-view').hidden=true;$('#welcome').hidden=false;
 installListeners();loading();
 try{await authenticate()}
 catch(e){me=null;showAuth();if(!String(e.message).includes('401'))notify('Введи дані для входу в Cloux')}
}
function stopRealtime(){
 wsChat?.close();wsInbox?.close();wsChat=null;wsInbox=null;
 clearInterval(syncTimer);clearTimeout(chatTimer);
}
function startPolling(){
 clearInterval(syncTimer);
 syncTimer=setInterval(()=>{if(!me||document.hidden)return;void loadChats(true);if(active)void loadMessages(true)},12000);
}
function websocket(path,onEvent){
 if(!me||!('WebSocket' in window))return null;
 const scheme=location.protocol==='https:'?'wss://':'ws://';
 const socket=new WebSocket(scheme+location.host+path);
 socket.onmessage=e=>{try{onEvent(JSON.parse(e.data))}catch{}};
 socket.onerror=()=>{};return socket;
}
function connectInbox(){
 wsInbox?.close();
 wsInbox=websocket('/ws/inbox',data=>{
  if(data.type==='inbox_update')void loadChats(true);
 if(data.type==='call_invite')void incomingCall(data);
 });
}
function connectChat(id){
 wsChat?.close();wsChat=websocket('/ws/chats/'+encodeURIComponent(id),data=>{
  if(!me||id!==active)return;
  if(['new_message','message_updated','message_deleted','reactions_updated','read'].includes(data.type)){
   clearTimeout(chatTimer);chatTimer=setTimeout(()=>{void loadMessages(true);void loadChats(true)},120);
  }else if(data.type==='call_invite'){void incomingCall(data);
  }else if(data.type==='typing'&&data.user_id!==me.id){
   $('#chat-status').textContent='Друкує…';
   clearTimeout(typingTimer);typingTimer=setTimeout(()=>setChatStatus(),1800);
  }
 });
}
async function loadChats(silent=false){
 if(!me)return;
 try{
  const data=await request('/api/chats');
  if(!me)return;chats=Array.isArray(data.chats)?data.chats:[];
  renderList();
  if(active&&!chats.some(x=>x.id===active)){closeChat()}
 }catch(err){if(!silent)notify(err.message)}
}
function chatFilter(c){
 if(filter==='archived')return Boolean(c.archived);
 if(c.archived)return false;
 if(filter==='direct'&&!['direct','notes'].includes(c.kind))return false;
 if(filter==='group'&&!['group','channel','news'].includes(c.kind))return false;
 return true;
}
function visibleChats(){
 const needle=q.toLocaleLowerCase('uk').trim();
 return chats.filter(c=>chatFilter(c)&&(!needle||nameOf(c).toLocaleLowerCase('uk').includes(needle)||(c.last_text||'').toLocaleLowerCase('uk').includes(needle)))
  .sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||Number(b.last_time||0)-Number(a.last_time||0));
}
function badge(c){const code=c.kind==='news'?'✦':c.kind==='notes'?'★':c.kind==='channel'?'✷':c.kind==='group'?'♟':nameOf(c).charAt(0).toUpperCase();return c.kind==='news'||c.kind==='notes'?'<img src="'+avatar+'" alt="">':esc(code)}
function renderList(){
 const list=$('#chat-list');
 const shown=visibleChats();
 list.innerHTML=shown.length?shown.map((c,i)=>
 '<button class="chat-row'+(c.id===active?' active':'')+'" data-chat="'+esc(c.id)+'" style="animation-delay:'+Math.min(i*16,140)+'ms">'+
 '<span class="avatar">'+badge(c)+'</span><span class="chat-txt"><div><b>'+esc((c.pinned?'📌 ':'')+nameOf(c))+'</b><time>'+formatTime(c.last_time)+'</time></div>'+
 '<div><small>'+esc((c.muted?'🔕 ':'')+(drafts[c.id]?'✎ '+drafts[c.id]:(c.last_text||({news:'Офіційний канал',notes:'Збережені повідомлення'}[c.kind]||'Новий чат'))))+'</small></div></span></button>').join(''):
 '<p style="padding:24px;color:var(--text-dim);font-size:13px">'+(q?'За цим пошуком чатів немає. Скористайся кнопкою +, щоб знайти користувачів.':'Поки що немає чатів. Натисни +, щоб почати розмову.')+'</p>';
 $$('[data-chat]',list).forEach(el=>{
  el.onclick=()=>void openChat(el.dataset.chat);
  el.oncontextmenu=e=>{e.preventDefault();active=el.dataset.chat;openChatMenu()};
  let x=0;el.addEventListener('touchstart',e=>{x=e.touches[0].clientX},{passive:true});
  el.addEventListener('touchend',e=>{
   const delta=e.changedTouches[0].clientX-x;
   if(Math.abs(delta)>100)void setChatPref(el.dataset.chat,'archived',delta<0);
  },{passive:true});
 });
 requestAnimationFrame(syncIndicator);
}
function syncIndicator(){
 const button=$('#folders .selected'),bar=$('.folder-indicator');if(!button||!bar)return;
 const bounds=button.getBoundingClientRect(),nav=$('#folders').getBoundingClientRect();
 bar.style.width=bounds.width+'px';bar.style.transform='translateX('+(bounds.left-nav.left)+'px)';
}
async function openChat(id){
 const c=chats.find(x=>x.id===id);if(!c)return;
 active=id;editing=null;reply=null;messages=[];
 $('#shell').classList.add('chat-open');$('#welcome').hidden=true;$('#chat-view').hidden=false;
 $('#draft').value=drafts[id]||'';resizeDraft();setChatStatus();
 $('#chat-name').textContent=nameOf(c);
 $('#chat-avatar').innerHTML=c.kind==='news'||c.kind==='notes'?'<img src="'+avatar+'" alt="">':esc(nameOf(c).charAt(0));
 $('#messages').innerHTML='<div class="day-label">Завантажуємо повідомлення…</div>';
 renderList();connectChat(id);await loadMessages();markRead();$('#draft').focus({preventScroll:true});
}
function setChatStatus(){
 const c=activeChat();
 if(!c)return;
 $('#chat-status').textContent=c.kind==='direct'?'Особистий чат':c.kind==='group'?'Група':c.kind==='channel'?'Канал':c.kind==='news'?'Офіційний канал':'Збережені повідомлення';
}
function closeChat(){
 active=null;reply=null;editing=null;wsChat?.close();wsChat=null;
 $('#shell').classList.remove('chat-open');$('#welcome').hidden=false;$('#chat-view').hidden=true;renderList();
}
async function loadMessages(silent=false){
 const id=active;if(!id||!me)return;
 try{
  const [data,rx]=await Promise.all([request('/api/chats/'+encodeURIComponent(id)+'/messages'),request('/api/chats/'+encodeURIComponent(id)+'/reactions').catch(()=>({reactions:{}}))]);
  if(id!==active)return;
  const list=Array.isArray(data.messages)?data.messages:[];
  const changed=JSON.stringify(list)!==JSON.stringify(messages)||JSON.stringify(rx.reactions||{})!==JSON.stringify(reactions);
  if(changed){messages=list;reactions=rx.reactions||{};renderMessages()}
 }catch(err){if(!silent)notify(err.message)}
}
function textMarkup(value){
 let s=esc(value);
 s=s.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/__([^_]+)__/g,'<u>$1</u>').replace(/~~([^~]+)~~/g,'<s>$1</s>');
 s=s.replace(/\|\|([^|]+)\|\|/g,'<span class="spoiler" role="button" tabindex="0" aria-label="Відкрити спойлер">$1</span>');
 s=s.replace(/https?:\/\/[^\s<]+/g,v=>'<a href="'+v+'" target="_blank" rel="noopener noreferrer">'+v+'</a>');
 s=s.replace(/(@[a-zA-Z0-9_]+|#[\p{L}\p{N}_]+)/gu,'<u>$1</u>');
 return s;
}
function mediaMarkup(m){
 if(!m.attachment_id)return '';
 const url='/api/chats/'+encodeURIComponent(active)+'/media/'+encodeURIComponent(m.attachment_id);
 const mime=m.media_mime||'';
 if(mime.startsWith('image/'))return '<img class="message-media" loading="lazy" src="'+url+'" alt="'+esc(m.media_filename||'Зображення')+'">';
 if(mime.startsWith('video/'))return '<video class="message-media" playsinline controls preload="metadata" src="'+url+'"></video>';
 if(mime.startsWith('audio/'))return '<audio preload="none" controls src="'+url+'"></audio>';
 return '<a href="'+url+'" target="_blank" rel="noopener noreferrer">📎 '+esc(m.media_filename||'Завантажити файл')+'</a>';
}
function renderMessages(){
 const c=activeChat();if(!c)return;
 const box=$('#messages'),wall=$('#chat-wall');
 const isNearEnd=wall.scrollHeight-wall.scrollTop-wall.clientHeight<160;
 const html=messages.length?'<div class="day-label">Повідомлення Cloux</div>'+messages.map(m=>{
  const mine=m.sender===me.id;
  const replyMarkup=m.reply_to?'<div class="message-reply">↩ '+esc((m.reply_author||'')+': '+(m.reply_text||'Повідомлення'))+'</div>':'';
  const counts=reactions[String(m.id)]||{};
  const icons=Object.entries(counts).map(([em,item])=>'<button data-reaction="'+m.id+'" data-emoji="'+esc(em)+'" title="Реакція">'+em+' '+Number(item.count||0)+'</button>').join('');
  const text=m.attachment_id?esc(m.text||''):textMarkup(m.text||'');
  return '<article class="message '+(mine?'own':'')+'" data-message="'+m.id+'">'+replyMarkup+
  '<span class="message-body">'+text+'</span>'+mediaMarkup(m)+
  '<span class="message-meta">'+formatTime(m.created)+(mine?' <span>✓✓</span>':'')+'</span>'+
  (icons?'<span class="reaction-strip">'+icons+'</span>':'')+'</article>'
 }).join(''):'<div class="day-label">Тут ще немає повідомлень. Почни розмову.</div>';
 box.innerHTML=html;
 $$('[data-message]',box).forEach(el=>{
  const mid=Number(el.dataset.message);
  el.ondblclick=e=>{if(e.target.closest('a,button,video,audio,.spoiler'))return;void react(mid,'❤️')};
  el.oncontextmenu=e=>{e.preventDefault();messageMenu(mid)};
  let touchAt=0,from=0;el.addEventListener('touchstart',e=>{from=e.touches[0].clientX;touchAt=window.setTimeout(()=>messageMenu(mid),520)},{passive:true});
  el.addEventListener('touchmove',e=>{if(Math.abs(e.touches[0].clientX-from)>22)clearTimeout(touchAt)},{passive:true});
  el.addEventListener('touchend',e=>{clearTimeout(touchAt);if(e.changedTouches[0].clientX-from>80)setReply(mid)},{passive:true});
 });
 $$('[data-reaction]',box).forEach(btn=>btn.onclick=()=>void react(Number(btn.dataset.reaction),btn.dataset.emoji));
 $$('.spoiler',box).forEach(el=>{el.onclick=()=>el.classList.add('open');el.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')el.classList.add('open')}});
 if(isNearEnd||!wall.dataset.scrolled)wall.scrollTop=wall.scrollHeight;
 updateReplyBar();
}
function markRead(){
 if(!active)return;
 void request('/api/chats/'+encodeURIComponent(active)+'/read',{method:'POST'}).catch(()=>{});
}
async function react(mid,emoji){
 try{await request('/api/messages/'+mid+'/reactions',{method:'POST',body:{emoji}});await loadMessages(true)}
 catch(err){notify(err.message)}
}
function setReply(mid){
 const m=messages.find(x=>x.id===mid);if(!m)return;
 reply=m;editing=null;updateReplyBar();$('#draft').focus();
}
function updateReplyBar(){
 const bar=$('#reply-line');
 if(!reply&&!editing){bar.hidden=true;bar.textContent='';return}
 bar.hidden=false;
 const label=editing?'✎ Редагування повідомлення':'↩ Відповідь: '+(reply.text||'').slice(0,90);
 bar.replaceChildren(document.createTextNode(label));
 const b=document.createElement('button');b.textContent='×';b.setAttribute('aria-label','Скасувати');b.onclick=()=>{reply=null;editing=null;updateReplyBar()};
 bar.append(b);
}
async function send(){
 const c=activeChat(),d=$('#draft'),value=d.value.trim();
 if(!c)return;
 if(!value){void voice();return}
 if(c.kind==='news'||c.kind==='channel'&&!c.is_owner){notify('У цей канал можуть писати лише адміністратори');return}
 $('#send').disabled=true;
 try{
  if(editing){await request('/api/messages/'+editing.id,{method:'PATCH',body:{text:value}})}
  else if(reply){await request('/api/chats/'+encodeURIComponent(c.id)+'/reply/'+reply.id,{method:'POST',body:{text:value}})}
  else await request('/api/chats/'+encodeURIComponent(c.id)+'/messages',{method:'POST',body:{text:value}});
  d.value='';delete drafts[c.id];persistDrafts();reply=null;editing=null;updateReplyBar();resizeDraft();
  await Promise.all([loadMessages(true),loadChats(true)]);markRead();
 }catch(err){notify('Не надіслано: '+err.message)}
 finally{$('#send').disabled=false}
}
function persistDrafts(){try{sessionStorage.setItem('cloux:live:drafts',JSON.stringify(drafts))}catch{}}
function resizeDraft(){const d=$('#draft');d.style.height='46px';d.style.height=Math.min(d.scrollHeight,136)+'px';$('#send').textContent=d.value.trim()?'↑':'●'}
function dimClose(){return ()=>{closeSheet();}}
function closeSheet(){
 $('#sheet').hidden=true;$('#shade').hidden=true;$('#emoji-keyboard').hidden=true;
}
function sheet(title,buttons=[],markup=''){
 const el=$('#sheet');el.hidden=false;$('#shade').hidden=false;$('#shade').onclick=closeSheet;
 el.innerHTML='<button class="close-x" id="sheet-close" aria-label="Закрити">×</button><h2>'+esc(title)+'</h2>'+
 buttons.map((b,i)=>'<button class="row" data-action="'+i+'">'+esc(b.text)+'</button>').join('')+markup;
 $('#sheet-close').onclick=closeSheet;
 $$('[data-action]',el).forEach(btn=>btn.onclick=()=>{const fn=buttons[Number(btn.dataset.action)]?.onClick;closeSheet();if(fn)void fn()});
}
async function setChatPref(id,key,value){
 const current=chats.find(c=>c.id===id);if(!current)return;
 try{await request('/api/chats/'+encodeURIComponent(id)+'/preferences',{method:'POST',body:{[key]:Boolean(value)}});await loadChats(true)}
 catch(err){notify(err.message)}
}
function openChatMenu(){
 const c=activeChat();if(!c)return;
 sheet(nameOf(c),[
 {text:c.pinned?'📌 Відкріпити':'📌 Закріпити',onClick:()=>setChatPref(c.id,'pinned',!c.pinned)},
 {text:c.archived?'↩ Повернути з архіву':'▣ Архівувати',onClick:()=>setChatPref(c.id,'archived',!c.archived)},
 {text:c.muted?'🔔 Увімкнути повідомлення':'🔕 Вимкнути сповіщення',onClick:()=>setChatPref(c.id,'muted',!c.muted)},
 {text:'⌕ Знайти повідомлення',onClick:searchMessages},
 {text:'↗ Поділитися запрошенням',onClick:()=>void createInvite(c.id)}
 ]);
}
async function createInvite(id){
 try{const data=await request('/api/chats/'+encodeURIComponent(id)+'/invite',{method:'POST'});
 if(!data.code)throw Error('Посилання не створено');
 const link=location.origin+'/?join='+encodeURIComponent(data.code);
 await navigator.clipboard.writeText(link);notify('Запрошення скопійовано')}
 catch(e){notify(e.message)}
}
function messageMenu(id){
 const m=messages.find(x=>x.id===id);if(!m)return;
 const mine=m.sender===me.id;
 const buttons=[
 {text:'❤️ Обрати реакцію',onClick:()=>openEmojis(x=>void react(id,x))},
 {text:'↩ Відповісти',onClick:()=>setReply(id)},
 {text:'⧉ Копіювати',onClick:async()=>{try{await navigator.clipboard.writeText(m.text||'');notify('Скопійовано')}catch{notify('Копіювання недоступне')}}},
 {text:'➤ Переслати в інший чат',onClick:()=>forwardMessage(id)}
 ];
 if(mine){
 buttons.push({text:'✎ Редагувати',onClick:()=>{editing=m;reply=null;$('#draft').value=m.text||'';updateReplyBar();resizeDraft();$('#draft').focus()}});
 buttons.push({text:'✕ Видалити для всіх',onClick:async()=>{if(!confirm('Видалити повідомлення для всіх?'))return;try{await request('/api/messages/'+id,{method:'DELETE'});await loadMessages(true);await loadChats(true)}catch(err){notify(err.message)}}});
 }
 sheet('Повідомлення',buttons);
}
async function forwardMessage(id){
 const c=activeChat();if(!c)return;
 const others=chats.filter(t=>t.id!==c.id&&t.kind!=='news'&&(t.kind!=='channel'||t.is_owner));
 sheet('Переслати повідомлення',others.map(target=>({text:'➤ '+nameOf(target),onClick:async()=>{
 try{await request('/api/chats/'+encodeURIComponent(c.id)+'/forward/'+id,{method:'POST',body:{target_chat_id:target.id}});notify('Переслано в '+nameOf(target))}
 catch(err){notify(err.message)}
 }})));
}
async function searchMessages(){
 const term=prompt('Пошук повідомлення');if(!term?.trim())return;
 try{const data=await request('/api/messages/search?q='+encodeURIComponent(term.trim()));
 const own=(data.messages||[]).filter(m=>m.chat_id===active);
 if(!own.length){notify('У цьому чаті не знайдено');return}
 const el=$('[data-message="'+own[0].id+'"]');if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('selected');setTimeout(()=>el.classList.remove('selected'),1500)}
 else notify('Повідомлення старіше за останні 200. Відкрий пошук у повній версії.')}catch(err){notify(err.message)}
}
function openEmojis(callback){
 const box=$('#emoji-keyboard');box.hidden=false;$('#shade').hidden=false;$('#shade').onclick=closeSheet;
 const cats=[
 ['Недавні','◴',[]],['Смайли','😀',['😀','😄','😁','😂','🤣','😊','😉','😍','😘','🥰','😎','🥳','🤔','🥹','😭','😢','😡','🫶','😱','😤','😏','😇']],
 ['Люди','👍',['👍','👎','👏','🙏','👋','✌️','👌','🤝','🤞','🤟','🤙','🫰','💪','👀']],
 ['Серця','❤️',['❤️','🩷','🖤','🤍','💔','💙','💚','💜','🧡','💛','💕','💖','💓','✨','🔥']],
 ['Тварини','🐱',['🐱','🐶','🐰','🦊','🐻','🐼','🦄','🐙','🐬','🐢','🐸']],
 ['Їжа','🍕',['🍕','🍔','🍟','🍣','🍉','🍰','🍫','☕','🧋','🍓','🍎']],
 ['Інше','✨',['🎉','🎁','🎈','🔥','⚡','🎮','🏆','🌙','⭐','❄️','✅','🚀','🕊️']]
 ];
 let recent=[];try{recent=JSON.parse(localStorage.getItem('cloux:live:emoji')||'[]')}catch{}
 cats[0][2]=recent.length?recent:['❤️','😂','👍','🔥','🥰','✨'];
 let selected=0;
 const render=()=>{
 box.innerHTML='<div class="emoji-title"><h2>Емодзі</h2><button id="close-emojis" aria-label="Закрити">×</button></div><label class="find">⌕ <input id="emoji-search" aria-label="Пошук емодзі" placeholder="Пошук емодзі…"></label><div id="emoji-grid" class="emoji-grid"></div><nav class="emoji-tabs">'+cats.map((c,i)=>'<button data-cat="'+i+'" class="'+(i===selected?'chosen':'')+'" title="'+esc(c[0])+'">'+c[1]+'</button>').join('')+'</nav>';
 $('#close-emojis').onclick=closeSheet;
 const paint=()=>{
  const term=$('#emoji-search').value.trim().toLowerCase();
  const names={'❤️':'серце','😂':'сміх','😭':'плач','🔥':'вогонь','🥰':'любов','👍':'так лайк','🐱':'кіт','🎉':'свято','✨':'зірки'};
  const items=term?[...new Set(cats.flatMap(c=>c[2]))].filter(e=>e.includes(term)||(names[e]||'').includes(term)||cats.some(c=>c[0].toLowerCase().includes(term)&&c[2].includes(e))):cats[selected][2];
  $('#emoji-grid').innerHTML=items.map(e=>'<button data-emoji="'+esc(e)+'" aria-label="Емодзі '+esc(e)+'">'+e+'</button>').join('')||'<p>Нічого не знайдено</p>';
  $$('[data-emoji]',box).forEach(b=>b.onclick=()=>{
   const em=b.dataset.emoji;recent=[em,...recent.filter(x=>x!==em)].slice(0,25);
   try{localStorage.setItem('cloux:live:emoji',JSON.stringify(recent))}catch{}
   closeSheet();callback(em);
  });
 };
 $('#emoji-search').oninput=paint;
 $$('[data-cat]',box).forEach(b=>b.onclick=()=>{selected=Number(b.dataset.cat);render()});
 paint();
 };
 render();
}
async function uploadFile(file){
 if(!active||!file)return;
 if(file.size>5*1024*1024){notify('Максимальний розмір файлу зараз 5 МБ');return}
 const types=['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/ogg','audio/mpeg','audio/mp4','video/webm','video/mp4','application/pdf'];
 const mime=file.type.split(';')[0];if(!types.includes(mime)){notify('Сервер не підтримує такий тип файлу');return}
 try{
  notify('Завантажуємо файл…');
  await request('/api/chats/'+encodeURIComponent(active)+'/media',{method:'POST',raw:true,body:file,
    headers:{'Content-Type':mime,'X-Cloux-Filename':encodeURIComponent(file.name)}});
  await loadMessages(true);await loadChats(true);notify('Файл надіслано');
 }catch(e){notify('Файл не надіслано: '+e.message)}
}
async function voice(){
 const media=window.ClouxStudioMedia;if(!media){notify('Мікрофон недоступний');return}
 if(media.isRecording()){media.finishVoice();return}
 const ok=await media.voice({onFile:file=>void uploadFile(file),
 onLevel:level=>{$('#send').style.boxShadow='0 0 '+Math.round(15+level*95)+'px var(--hot)'},
 onState:text=>{if(text==='Запис зупинено'){$('#send').textContent='●';$('#send').style.boxShadow=''}},
 onError:notify});
 if(ok){$('#send').textContent='■';notify('Триває запис голосового. Натисни ■, щоб завершити.')}
}
async function camera(){
 const media=window.ClouxStudioMedia;if(!media){notify('Камера недоступна');return}
 await media.camera({target:$('#media-modal'),onFile:file=>void uploadFile(file),onState:()=>{},onError:notify});
}
async function call(mode){
 const c=activeChat();if(!c)return;
 if(c.kind!=='direct'){notify('Наразі WebRTC доступний для особистих дзвінків');return}
 if(!window.ClouxStudioLiveCalls){notify('З’єднання дзвінків недоступне');return}
 const invite=()=>{if(wsChat?.readyState===WebSocket.OPEN){wsChat.send(JSON.stringify({type:'call_invite',mode}))}};
 if(wsChat?.readyState===WebSocket.OPEN)invite();else wsChat?.addEventListener('open',invite,{once:true});
 await window.ClouxStudioLiveCalls.start({room:c.id,title:nameOf(c),mode,target:$('#call-screen'),onStatus:notify});
}
async function incomingCall(data){
 if(!me||data.user_id===me.id||!['audio','video'].includes(data.mode))return;
 const c=chats.find(x=>x.id===data.chat_id);if(!c||c.kind!=='direct')return;
 const key=data.user_id+'|'+data.chat_id+'|'+data.mode;
 if(lastIncomingCall===key)return;lastIncomingCall=key;setTimeout(()=>{if(lastIncomingCall===key)lastIncomingCall=''},9000);
 if(window.ClouxStudioLiveCalls?.active())return;
 if(confirm((data.mode==='video'?'Відеодзвінок':'Голосовий дзвінок')+' від '+nameOf(c)+'. Прийняти?')){
  if(active!==c.id)await openChat(c.id);
  await window.ClouxStudioLiveCalls.start({room:c.id,title:nameOf(c),mode:data.mode,target:$('#call-screen'),onStatus:notify});
 }
}
function openNewChat(){
 sheet('Новий чат',[
 {text:'👤 Знайти людину',onClick:contactSearch},
 {text:'♟ Створити групу',onClick:createGroup},
 {text:'✷ Створити канал',onClick:createChannel}
 ]);
}
function contactSearch(){
 sheet('Знайти користувача',[],'<label class="find" style="margin:12px 0">⌕ <input id="user-query" autocomplete="off" placeholder="Нік або ім’я (від 2 символів)"></label><div id="user-results"></div>');
 $('#user-query').focus();
 let pending=0;$('#user-query').oninput=()=>{
  clearTimeout(pending);const query=$('#user-query').value.trim();if(query.length<2){$('#user-results').innerHTML='<p>Введи мінімум 2 символи</p>';return}
  pending=setTimeout(async()=>{
   try{const data=await request('/api/users?q='+encodeURIComponent(query));
    if(!$('#user-results'))return;
    const users=data.users||[];
    $('#user-results').innerHTML=users.map(u=>'<button class="row" data-user="'+esc(u.id)+'">'+esc(u.display+' · @'+u.username)+'</button>').join('')||'<p>Користувачів не знайдено</p>';
    $$('[data-user]').forEach(el=>el.onclick=async()=>{try{const x=await request('/api/direct/'+encodeURIComponent(el.dataset.user),{method:'POST'});closeSheet();await loadChats();await openChat(x.chat_id)}catch(err){notify(err.message)}});
   }catch(err){notify(err.message)}
  },250)
 };
}
async function createGroup(){
 const title=prompt('Назва групи');if(!title?.trim())return;
 const username=prompt('Додати учасника за нікнеймом? (можна пропустити)')||'';
 let users=[];
 if(username.trim()){
  try{const found=(await request('/api/users?q='+encodeURIComponent(username.trim()))).users||[];
   const exact=found.find(u=>u.username.toLowerCase()===username.trim().replace(/^@/,'').toLowerCase());
   if(!exact){notify('Користувача не знайдено');return}users=[exact.id];
  }catch(err){notify(err.message);return}
 }
 try{const x=await request('/api/groups',{method:'POST',body:{title:title.trim(),members:users}});await loadChats();await openChat(x.chat_id)}
 catch(err){notify(err.message)}
}
async function createChannel(){
 const title=prompt('Назва каналу');if(!title?.trim())return;
 try{const x=await request('/api/channels',{method:'POST',body:{title:title.trim()}});await loadChats();await openChat(x.chat_id)}
 catch(err){notify(err.message)}
}
async function showSettings(){
 try{
  const [p,data]=await Promise.all([request('/api/profile'),request('/api/preferences')]);
  profile=p.profile;pref=data.preferences||{};
  const markup='<div class="settings-real"><img src="'+avatar+'" alt="Аватар Cloux" class="settings-avatar"><p>Акаунт: <b>'+esc(me.display)+'</b> · @'+esc(me.username)+'</p>'+
  '<form id="profile-edit"><label>Ім’я<input name="display" maxlength="48" required value="'+esc(profile.display||me.display)+'"></label>'+
  '<label>Позивний<input name="username" minlength="4" maxlength="24" pattern="[a-zA-Z0-9_]+" required value="'+esc(profile.username||me.username)+'"></label>'+
  '<label>Про себе<input name="bio" maxlength="180" value="'+esc(profile.bio||'')+'"></label><button class="row settings-save" type="submit">✓ Зберегти профіль</button></form>'+
  '<label class="settings-slider">Розмір тексту <input type="range" min="13" max="21" id="prefs-font" value="'+(pref.font_size||15)+'"></label>'+
  '<label class="settings-toggle"><input type="checkbox" id="prefs-animations" '+(pref.animations===0?'':'checked')+'> Анімації</label>'+
  '<label class="settings-toggle"><input type="checkbox" id="prefs-searchable" '+(pref.searchable===0?'':'checked')+'> Показувати в пошуку</label>'+
  '<button class="row settings-logout" id="logout-cloux">Вийти з акаунта</button></div>';
  sheet('Налаштування Cloux',[],markup);
  $('#profile-edit').onsubmit=async e=>{
   e.preventDefault();const v=Object.fromEntries(new FormData(e.target).entries());
   try{await request('/api/profile',{method:'PATCH',body:v});me.display=v.display;me.username=v.username;notify('Профіль оновлено')}catch(err){notify(err.message)}
  };
  $('#prefs-font').onchange=async e=>{try{await request('/api/preferences',{method:'PATCH',body:{font_size:Number(e.target.value)}});document.documentElement.style.fontSize=e.target.value+'px'}catch(err){notify(err.message)}};
  for(const key of ['animations','searchable'])$('#prefs-'+key).onchange=async e=>{try{await request('/api/preferences',{method:'PATCH',body:{[key]:e.target.checked}})}catch(err){notify(err.message)}};
  $('#logout-cloux').onclick=async()=>{try{await request('/api/logout',{method:'POST'});stopRealtime();me=null;active=null;chats=[];messages=[];closeSheet();showAuth();renderList()}catch(err){notify(err.message)}};
 }catch(err){notify(err.message)}
}
function installListeners(){
 $('#stories').hidden=true;$('#chat-view').hidden=true;$('#welcome').hidden=false;
 const brand=$('.notice-demo');if(brand)brand.remove();
 $('#new-chat').onclick=openNewChat;$('#sidebar-menu').onclick=()=>sheet('Cloux',[
 {text:'👤 Знайти користувача',onClick:contactSearch},
 {text:'♟ Нова група',onClick:createGroup},
 {text:'✷ Новий канал',onClick:createChannel},
 {text:'⚙ Налаштування',onClick:showSettings},
 {text:'↓ Завантажити Cloux',onClick:()=>location.href='/download'}
 ]);
 $('#preferences').onclick=()=>void showSettings();
 $('#back-chat').onclick=closeChat;
 $('#chat-options').onclick=openChatMenu;
 $('#chat-search').onclick=()=>void searchMessages();
 $('#call-audio').onclick=()=>void call('audio');
 $('#call-video').onclick=()=>void call('video');
 $('#emoji-open').onclick=()=>openEmojis(emoji=>{
  const d=$('#draft'),a=d.selectionStart,b=d.selectionEnd;
  d.setRangeText(emoji,a,b,'end');resizeDraft();d.focus();
 });
 $('#camera').onclick=()=>void camera();
 $('#attach').onclick=()=>$('#attachment-input').click();
 $('#attachment-input').onchange=e=>{const file=e.target.files?.[0];if(file)void uploadFile(file);e.target.value=''};
 $('#send').onclick=()=>void send();
 $('#draft').oninput=e=>{
  resizeDraft();if(active){drafts[active]=e.target.value;persistDrafts()}
  if(wsChat?.readyState===WebSocket.OPEN)wsChat.send(JSON.stringify({type:'typing',active:Boolean(e.target.value)}));
 };
 $('#draft').onkeydown=e=>{
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}
  if(e.key==='Escape'){editing=null;reply=null;updateReplyBar()}
  if(e.key==='ArrowUp'&&!e.target.value&&messages.length){const last=[...messages].reverse().find(m=>m.sender===me?.id);if(last){editing=last;reply=null;e.target.value=last.text;resizeDraft();updateReplyBar()}}
 };
 $('#search').oninput=e=>{q=e.target.value.toLocaleLowerCase('uk');renderList()};
 $$('#folders button').forEach(b=>b.onclick=()=>{
  filter=b.dataset.filter;$$('#folders button').forEach(x=>x.classList.toggle('selected',x===b));renderList();
 });
 $('#scroll-bottom').onclick=()=>$('#chat-wall').scrollTo({top:$('#chat-wall').scrollHeight,behavior:'smooth'});
 $('#chat-wall').onscroll=()=>{$('#chat-wall').dataset.scrolled='1'};
 document.addEventListener('dragover',e=>e.preventDefault());
 document.addEventListener('drop',e=>{if(active&&e.dataTransfer.files[0]){e.preventDefault();void uploadFile(e.dataTransfer.files[0])}});
 window.addEventListener('resize',syncIndicator);
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
   if(window.ClouxStudioLiveCalls?.active()){window.ClouxStudioLiveCalls.end();return}
   if(!$('#shade').hidden){closeSheet();return}
   if(active)closeChat();
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();closeChat();$('#search').focus()}
  if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)&&active){
   e.preventDefault();const all=visibleChats(),i=all.findIndex(x=>x.id===active),item=all[i+(e.key==='ArrowUp'?-1:1)];if(item)void openChat(item.id)
  }
 });
}
void initialize();
})();
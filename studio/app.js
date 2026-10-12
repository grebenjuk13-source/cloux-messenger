/* CLOUX Studio — standalone progressive demo. No fabricated server accounts. */
(() => {
'use strict';
const VERSION='6.1.0';
const AVATAR='/assets/cloux-default-avatar.jpg';
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>Date.now();
const time=t=>new Date(t).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
const stamp=()=>new Date().toISOString();
const uid=()=>Math.random().toString(36).slice(2,10);
const demo=[
['cloux','Новини Cloux','channel','Оновлення Cloux Studio доступне ❤️',false],
['notes','Збережені повідомлення','saved','Тут можна зберігати свої думки',false],
['anna','Анна • демо','direct','Привіт! Як настрій? 🙂',false],
['max','Максим • демо','direct','Скину файл ввечері',false],
['design','Дизайн CLOUX • демо','group','Обговорення оновлень інтерфейсу',false],
['help','Cloux Помічник • бот','bot','Напиши «допомога», щоб отримати підказки',false],
['plan','Плани на тиждень • демо','group','Почнімо зі списку справ',false],
['school','Навчання • демо','group','Сьогодні плануємо проєкт',false],
['music','Музика • демо','channel','Що послухати сьогодні?',false],
['art','Арт і стікери • демо','group','Нові ідеї для стікерів 🔥',false],
['weather','Погода • бот','bot','Запитай про погоду',false],
['games','Ігровий чат • демо','direct','Ти сьогодні онлайн?',false],
['ideas','Ідеї • демо','saved','Створити власний стікерпак',false],
['archive','Старий діалог • демо','direct','Чат з архіву',true]
];
const answers=[
'Звучить цікаво! ❤️','Давай зробимо це сьогодні.','Круто, мені подобається ідея.',
'Ого! 🔥','Дякую за повідомлення.','Можемо обговорити деталі пізніше.'
];
const defaults=()=>({chats:demo.map(([id,name,kind,last,archived],i)=>({id,name,kind,archived,pinned:i<2,muted:false,unread:i===2?2:0,
 messages:[{id:uid(),text:i===0?'❤️ Вітаємо в Cloux! Це лише демонстраційні новини.':String(last),time:now()-((14-i)*360000),mine:false,type:'text',reactions:{}}]})),settings:{compact:false,font:15,background:0},drafts:{}});
let db;
try{db=JSON.parse(localStorage.getItem('cloux:studio:6')||'null');if(!db||!Array.isArray(db.chats))db=defaults()}catch{db=defaults()}
let active=db.chats[0]?.id||null,filter='all',query='',replyId=null,editId=null,sheetAction=null,emojiCategory='Нещодавні',toastTimer=0;
let recentEmoji=[];try{recentEmoji=JSON.parse(localStorage.getItem('cloux:studio:emoji')||'[]')}catch{}
const localAttachments=new Map();
const byId=id=>db.chats.find(c=>c.id===id);
const chat=()=>byId(active);
const save=()=>{try{const safe=JSON.parse(JSON.stringify(db,(k,v)=>k==='url'&&typeof v==='string'&&v.startsWith('blob:')?null:v));localStorage.setItem('cloux:studio:6',JSON.stringify(safe))}catch(e){console.warn('Cloux local demo storage full',e)}};
const tell=(text)=>{const box=$('#toast');box.textContent=text;box.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('show'),2800)};
function avatar(c){if(c.id==='notes'||c.id==='cloux'||c.kind==='saved')return '<span class="avatar"><img src="'+AVATAR+'" alt=""></span>';return '<span class="avatar">'+esc(c.name.slice(0,1))+'</span>'}
function markup(text){
 let s=esc(text);
 s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<u>$1</u>');
 s=s.replace(/~~([^~]+)~~/g,'<s>$1</s>').replace(/\|\|([^|]+)\|\|/g,'<span class="spoiler" tabindex="0" role="button" aria-label="Відкрити спойлер">$1</span>');
 s=s.replace(/(https?:\/\/[^\s<&"]+)/g,(u)=>'<a target="_blank" rel="noopener noreferrer" href="'+u+'">'+u+'</a>');
 s=s.replace(/(@[a-zA-Z0-9_]+|#[\p{L}\p{N}_]+)/gu,'<u>$1</u>');
 return s;
}
function filteredChats(){
 return db.chats.filter(c=>(filter==='archived'?c.archived:!c.archived)&&
   (filter==='all'||filter==='archived'||filter==='direct'&&['direct','saved','bot'].includes(c.kind)||filter==='group'&&['group','channel'].includes(c.kind))&&
   (c.name.toLowerCase().includes(query)||c.messages.some(m=>String(m.text||'').toLowerCase().includes(query))))
   .sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(b.messages.at(-1)?.time||0)-(a.messages.at(-1)?.time||0));
}
function renderStories(){
 $('#stories').innerHTML=db.chats.filter(c=>!c.archived).slice(0,7).map(c=>'<button class="story" data-story="'+esc(c.id)+'"><span class="avatar">'+(c.id==='cloux'||c.kind==='saved'?'<img src="'+AVATAR+'" alt="">':esc(c.name.slice(0,1)))+'</span><span>'+esc(c.name.split(' ')[0])+'</span></button>').join('');
 $$('[data-story]').forEach(b=>b.onclick=()=>openStory(b.dataset.story));
}
function renderList(){
 const list=$('#chat-list');
 list.innerHTML=filteredChats().map((c,i)=>{
 const last=c.messages.at(-1),t=last?.time||now();
 return '<button class="chat-row '+(c.id===active?'active':'')+'" style="animation-delay:'+Math.min(i*20,160)+'ms" data-chat="'+esc(c.id)+'" draggable="true">'+avatar(c)+
 '<span class="chat-txt"><div><b>'+esc(c.pinned?'📌 '+c.name:c.name)+'</b><time>'+time(t)+'</time></div>'+
 '<div><small>'+(c.muted?'🔕 ':'')+esc((db.drafts[c.id]||last?.text||'').slice(0,85))+'</small>'+(c.unread?'<span class="chip">'+c.unread+'</span>':'')+'</div></span></button>'}).join('')||'<p style="padding:22px;color:var(--text-dim)">Немає чатів у цій папці</p>';
 $$('.chat-row').forEach(b=>{
   b.onclick=()=>openChat(b.dataset.chat);
   b.oncontextmenu=e=>{e.preventDefault();active=b.dataset.chat;renderList();openChatMenu()};
   let x=0;b.addEventListener('touchstart',e=>x=e.touches[0].clientX,{passive:true});
   b.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-x;if(Math.abs(dx)>75){const c=byId(b.dataset.chat);c.archived=dx<0;save();renderList();tell(c.archived?'Переміщено до архіву':'Повернуто з архіву')}},{passive:true});
   b.ondragstart=e=>e.dataTransfer?.setData('text/plain',b.dataset.chat);
   b.ondragover=e=>e.preventDefault();
   b.ondrop=e=>{e.preventDefault();const from=e.dataTransfer?.getData('text/plain'),to=b.dataset.chat;let a=db.chats.findIndex(c=>c.id===from),z=db.chats.findIndex(c=>c.id===to);if(a<0||z<0||a===z)return;db.chats.splice(z,0,db.chats.splice(a,1)[0]);save();renderList()};
 });
 renderStories();
 requestAnimationFrame(slideFolderIndicator);
}
function slideFolderIndicator(){
 const activeButton=$('.folders .selected');
 if(!activeButton)return;
 const outer=$('#folders').getBoundingClientRect(),r=activeButton.getBoundingClientRect();
 const ind=$('.folder-indicator');
 ind.style.width=r.width+'px';ind.style.transform='translateX('+(r.left-outer.left)+'px)';
}
function openChat(id){
 if(!byId(id))return;
 active=id;replyId=null;editId=null;byId(id).unread=0;
 $('#shell').classList.add('chat-open');
 $('#welcome').hidden=true;$('#chat-view').hidden=false;
 $('#draft').value=db.drafts[id]||'';
 renderMessages();renderList();resizeDraft();save();
}
function backChat(){
 $('#shell').classList.remove('chat-open');active=null;
 $('#welcome').hidden=false;$('#chat-view').hidden=true;renderList();
}
function renderMessages(){
 const c=chat();if(!c)return;
 $('#chat-name').textContent=c.name;
 $('#chat-status').textContent=({direct:'особистий демочат',saved:'збережені локально',group:'демогрупа',channel:'демоканал',bot:'демобот'})[c.kind];
 const header=$('#chat-avatar');
 header.replaceChildren();
 if(c.kind==='saved'||c.id==='cloux'){const im=document.createElement('img');im.src=AVATAR;im.alt='Cloux';header.append(im)}
 else header.textContent=c.name.slice(0,1);
 const area=$('#messages');
 area.innerHTML='<div class="day-label">Сьогодні · демонстрація</div>'+c.messages.map(m=>{
 const reaction=m.reactions&&Object.keys(m.reactions).length?
 '<span class="reaction-strip">'+Object.entries(m.reactions).map(([r,n])=>'<button data-react-count="'+esc(m.id)+'" data-em="'+esc(r)+'">'+esc(r)+' '+n+'</button>').join('')+'</span>':'';
 const reply=m.reply?'<div class="message-reply">↩ '+esc(m.reply.slice(0,80))+'</div>':'';
 let body='<span class="message-body">'+markup(m.text||'')+'</span>';
 if(m.type==='photo'&&m.url)body+='<img class="message-media" src="'+esc(m.url)+'" alt="Прикріплене фото">';
 if(m.type==='video'&&m.url)body+='<video class="message-media" src="'+esc(m.url)+'" controls playsinline></video>';
 if(m.type==='audio'&&m.url)body+='<audio src="'+esc(m.url)+'" controls preload="metadata"></audio>';
 return '<article class="message '+(m.mine?'own':'')+' '+(m.type==='audio'?'voice':'')+'" data-message="'+esc(m.id)+'">'+
 (m.bot?'<small class="bot-tag">Демобот</small>':'')+reply+body+
 '<span class="message-meta">'+time(m.time)+(m.mine?'<span>✓✓</span>':'')+'</span>'+reaction+'</article>'
 }).join('');
 $$('.message',area).forEach(el=>{
   const id=el.dataset.message;
   el.ondblclick=e=>{if(e.target.closest('a,button,video,audio,.spoiler'))return;react(id,'❤️',el)};
   el.oncontextmenu=e=>{e.preventDefault();openMessageMenu(id)};
   let touchStart=0,tx=0,ty=0;
   el.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){tx=e.clientX;ty=e.clientY;touchStart=setTimeout(()=>{touchStart=0;openMessageMenu(id)},560)}});
   el.addEventListener('pointerup',e=>{clearTimeout(touchStart);if(e.pointerType==='touch'&&e.clientX-tx>95&&Math.abs(e.clientY-ty)<60){const m=c.messages.find(x=>x.id===id);replyId=id;renderReply(m)}});
   el.addEventListener('pointercancel',()=>clearTimeout(touchStart));
 });
 $$('.spoiler',area).forEach(el=>{el.onclick=()=>el.classList.add('open');el.onkeydown=e=>{if(e.key==='Enter')el.classList.add('open')}});
 $$('[data-react-count]',area).forEach(b=>b.onclick=()=>react(b.dataset.reactCount,b.dataset.em,b));
 const wall=$('#chat-wall');wall.scrollTop=wall.scrollHeight;
 updateReply();
}
function react(id,emoji,el){
 const c=chat(),m=c?.messages.find(x=>x.id===id);if(!m)return;
 m.reactions||={};m.reactions[emoji]=(m.reactions[emoji]||0)+1;save();renderMessages();
 if(emoji==='❤️'||emoji==='🎉')confetti(el,emoji);
}
function confetti(el,emoji){
 const rect=el?.getBoundingClientRect();if(!rect)return;
 for(let i=0;i<8;i++){const part=document.createElement('span');part.textContent=emoji;part.style.cssText='position:fixed;z-index:100;left:'+rect.left+'px;top:'+rect.top+'px;pointer-events:none;font-size:18px';
 document.body.append(part);part.animate([{opacity:1,transform:'translate(0,0) scale(.5)'},{opacity:0,transform:'translate('+(Math.random()*160-80)+'px,'+(Math.random()*-100-30)+'px) scale(1.2)'}],{duration:600,easing:'ease-out'}).finished.finally(()=>part.remove());}
}
function sendText(){
 const c=chat();if(!c)return;
 const text=$('#draft').value.trim();
 if(!text&&!editId)return;
 if(editId){const m=c.messages.find(x=>x.id===editId);if(m&&m.mine)m.text=text;editId=null;tell('Повідомлення змінено')}
 else{
   c.messages.push({id:uid(),text,time:now(),mine:true,type:'text',reactions:{},reply:replyId?c.messages.find(x=>x.id===replyId)?.text:''});
   if(c.kind==='bot')setTimeout(()=>botReply(c.id,text),650+Math.random()*650);
 }
 db.drafts[c.id]='';$('#draft').value='';replyId=null;updateReply();resizeDraft();save();renderMessages();renderList();
 $('#chat-wall').animate([{backgroundColor:'rgba(225,6,0,.06)'},{backgroundColor:'transparent'}],{duration:450});
}
function botReply(id,text){
 const c=byId(id);if(!c)return;
 const normalized=text.toLocaleLowerCase('uk');
 let answer=c.id==='weather'?'Це демобот без доступу до живої погоди. Для прогнозу перевір офіційний метеосервіс.':
 /допомога|команд|help/.test(normalized)?'Підказка: подвійний тап — ❤️, довге натискання — меню; 📎 додає файл, 🎤 записує голосове.':'Дякую! Я демонстраційний бот Cloux. '+answers[Math.floor(Math.random()*answers.length)];
 c.messages.push({id:uid(),text:answer,time:now(),mine:false,bot:true,type:'text',reactions:{}});
 if(active!==id)c.unread++;save();if(active===id)renderMessages();renderList();
}
function renderReply(m){
 if(!m)return;replyId=m.id;editId=null;$('#reply-line').hidden=false;
 $('#reply-line').innerHTML='↩ Відповідь: <b>'+esc(m.text.slice(0,80))+'</b><button id="cancel-reply" aria-label="Скасувати">×</button>';
 $('#cancel-reply').onclick=()=>{replyId=null;updateReply()};
 $('#draft').focus();
}
function updateReply(){if(replyId||editId){if(editId){$('#reply-line').hidden=false;$('#reply-line').textContent='✎ Редагування повідомлення · Esc для скасування'}}else{$('#reply-line').hidden=true;$('#reply-line').textContent=''}}
function resizeDraft(){const d=$('#draft');d.style.height='46px';d.style.height=Math.min(d.scrollHeight,130)+'px';$('#send').textContent=d.value.trim()?'↑':'●';$('#send').title=d.value.trim()?'Надіслати повідомлення':'Записати голосове'}
function shade(close){$('#shade').hidden=false;$('#shade').onclick=close}
function closeOverlays(){
 $('#sheet').hidden=true;$('#emoji-keyboard').hidden=true;$('#shade').hidden=true;$('#media-modal').hidden=true;
 if(mediaStream&&!$('#call-screen').hidden)return;
 stopMedia();
}
function sheet(title,rows,extra=''){
 const box=$('#sheet');box.hidden=false;shade(closeOverlays);
 box.innerHTML='<button class="close-x" id="sheet-close" aria-label="Закрити">×</button><h2>'+esc(title)+'</h2>'+
 rows.map((r,i)=>'<button class="row '+(r.danger?'danger':'')+'" data-row="'+i+'">'+esc(r.label)+'</button>').join('')+extra;
 $('#sheet-close').onclick=closeOverlays;
 $$('[data-row]',box).forEach(b=>b.onclick=()=>{const action=rows[+b.dataset.row]?.run;closeOverlays();if(action)action()});
}
function openChatMenu(){
 const c=chat();if(!c)return;
 sheet(c.name,[
 {label:c.pinned?'📌 Відкріпити':'📌 Закріпити',run:()=>{c.pinned=!c.pinned;save();renderList()}},
 {label:c.muted?'🔔 Увімкнути сповіщення':'🔕 Вимкнути сповіщення',run:()=>{c.muted=!c.muted;save();renderList()}},
 {label:c.archived?'↩ Повернути з архіву':'▣ Архівувати',run:()=>{c.archived=!c.archived;save();renderList();tell(c.archived?'У архіві':'Повернуто')}},
 {label:'✎ Перейменувати (локально)',run:()=>{const n=prompt('Назва демочату',c.name);if(n?.trim()){c.name=n.trim().slice(0,48);save();renderMessages();renderList()}}},
 {label:'✕ Видалити локальний діалог',danger:true,run:()=>{if(confirm('Видалити цей демочат на пристрої?')){db.chats=db.chats.filter(x=>x.id!==c.id);save();backChat()}}}
 ]);
}
function openMessageMenu(id){
 const c=chat(),m=c?.messages.find(x=>x.id===id);if(!m)return;
 const rows=[
 {label:'❤️ Реакції',run:()=>emojiPicker(e=>react(id,e,$('[data-message="'+id+'"]')))},
 {label:'↩ Відповісти',run:()=>renderReply(m)},
 {label:'⧉ Копіювати',run:async()=>{try{await navigator.clipboard.writeText(m.text||'');tell('Скопійовано')}catch{tell('Не вдалося скопіювати')}}},
 {label:'➤ Переслати в інший демочат',run:()=>{const target=db.chats.find(x=>x.id!==c.id);if(target){target.messages.push({...m,id:uid(),time:now(),mine:true,text:'➤ '+(m.text||'')});save();tell('Переслано в '+target.name)}}}
 ];
 if(m.mine){rows.push({label:'✎ Редагувати',run:()=>{editId=id;replyId=null;$('#draft').value=m.text||'';updateReply();resizeDraft();$('#draft').focus()}})}
 rows.push({label:'✕ Видалити повідомлення',danger:true,run:()=>{const el=$('[data-message="'+id+'"]');el?.classList.add('removing');setTimeout(()=>{c.messages=c.messages.filter(x=>x.id!==id);save();renderMessages();renderList()},220)}});
 sheet('Дії з повідомленням',rows);
}
function openStory(id){
 const c=byId(id);if(!c)return;
 sheet('Історія · '+c.name,[], '<div style="position:relative;padding:24px 8px;text-align:center;border-radius:20px;background:radial-gradient(circle,#790007,#1b1013)"><div style="height:3px;background:var(--hot);border-radius:8px;margin-bottom:24px"></div><div style="font-size:75px">✦</div><h2>'+esc(c.name)+'</h2><p>Демонстрація кілець і перегляду історій Cloux.</p></div>');
}
function createChat(){
 const name=prompt('Назва нового локального демочату');if(!name?.trim())return;
 const id=uid();db.chats.unshift({id,name:name.trim().slice(0,48),kind:'direct',archived:false,pinned:false,muted:false,unread:0,messages:[]});
 save();renderList();openChat(id);
}
const emojiSets=[
['Нещодавні','◴',[]],['Смайли','😀',['😀','😄','😁','😂','🤣','😊','😉','😍','😘','🥰','😎','🤩','🥳','🤔','🥹','😴','😎','😭','😢','😤','😡','🥺','🫶','😱','🤗','😇','🙃','😏','😬','🤯']],
['Жести','👍',['👍','👎','👏','🙏','👋','✌️','👌','🤞','🫰','🫶','🤟','🤙','💪','👐','🙌','🤝','✍️','☝️','👇','👉','👈']],
['Серця','❤️',['❤️','🖤','🤍','💔','🩷','💜','💙','💚','🧡','💛','💗','💖','💕','💓','💞','💘','💝','💟','❤️‍🔥','💋','❣️','🔥','✨','🌟']],
['Тварини','🐱',['🐱','🐶','🦊','🐻','🐼','🐸','🐵','🐰','🐨','🐯','🦁','🐻‍❄️','🦄','🐙','🐬','🦋','🐈','🐈‍⬛','🐢','🐥']],
['Їжа','🍕',['🍕','🍔','🍟','🍣','🍜','🍩','🍪','🍓','🍎','🍉','🍍','🍦','🍰','🎂','☕','🧋','🍫','🍒','🥐','🥑']],
['Інше','✨',['🎉','🎊','🎁','🎈','🔥','⚡','🎮','🏆','🎨','🌈','🌸','🌹','☀️','🌙','⭐','☁️','❄️','🌊','💯','✅','🔴','🔔','✉️','🚀']]
];
const alias={'❤️':'серце любов','😂':'сміх сміятися','😢':'сум сльози','😭':'плач','🔥':'вогонь','🎉':'свято','👍':'лайк так','👎':'ні','😍':'любов','🐱':'кіт'};
function emojiPicker(onPick){
 const box=$('#emoji-keyboard');
 shade(closeOverlays);box.hidden=false;emojiCategory='Нещодавні';
 function draw(){
  let all=emojiSets.map(s=>[s[0],s[1],s[0]==='Нещодавні'?(recentEmoji.length?recentEmoji:['❤️','👍','😂','🔥','🥰','👏','😎']):s[2]]);
  box.innerHTML='<div class="emoji-title"><h2>Емодзі</h2><button id="close-emoji">×</button></div>'+
  '<label class="find">⌕ <input id="emoji-query" placeholder="Пошук емодзі…"></label><strong id="emoji-title" style="font-size:12px;margin-bottom:8px">'+esc(emojiCategory)+'</strong><div id="emoji-grid" class="emoji-grid"></div>'+
  '<nav class="emoji-tabs">'+all.map((s,i)=>'<button data-cat="'+i+'" class="'+(s[0]===emojiCategory?'chosen':'')+'" title="'+esc(s[0])+'">'+s[1]+'</button>').join('')+'</nav>';
  $('#close-emoji').onclick=closeOverlays;
  const paint=()=>{const q=$('#emoji-query').value.trim().toLocaleLowerCase('uk');
   const current=q?[...new Set(all.flatMap(s=>s[2]))].filter(e=>e.includes(q)||(alias[e]||'').includes(q)||all.some(s=>s[2].includes(e)&&s[0].toLowerCase().includes(q))):all.find(s=>s[0]===emojiCategory)?.[2]||[];
   $('#emoji-title').textContent=q?'Результати пошуку':emojiCategory;
   $('#emoji-grid').innerHTML=current.map(e=>'<button data-e="'+esc(e)+'" title="'+esc(alias[e]||e)+'">'+e+'</button>').join('')||'<p>Нічого не знайдено</p>';
   $$('[data-e]',box).forEach(b=>b.onclick=()=>{recentEmoji=[b.dataset.e,...recentEmoji.filter(e=>e!==b.dataset.e)].slice(0,24);try{localStorage.setItem('cloux:studio:emoji',JSON.stringify(recentEmoji))}catch{}onPick(b.dataset.e);closeOverlays()});
  };
  $('#emoji-query').oninput=paint;
  $$('[data-cat]',box).forEach(b=>b.onclick=()=>{emojiCategory=all[+b.dataset.cat][0];draw()});
  paint();
 }
 draw();
}
function settings(){
 const body='<p>Усі зміни зберігаються лише на цьому пристрої.</p><label style="display:grid;gap:8px">Розмір повідомлень <input id="font-size" type="range" min="12" max="22" value="'+db.settings.font+'"></label>'+
 '<button id="reset-demo" class="row danger">↻ Скинути лише демочати</button><p>Поточний акаунт та серверні чати Cloux тут не змінюються.</p>';
 sheet('Налаштування Cloux Studio',[],body);
 $('#font-size').oninput=e=>{db.settings.font=+e.target.value;document.documentElement.style.fontSize=db.settings.font+'px';save()};
 $('#reset-demo').onclick=()=>{if(confirm('Скинути локальну демонстрацію?')){db=defaults();active=null;save();closeOverlays();backChat();renderList()}};
}
function scheduleMessage(){
 const c=chat();if(!c)return;
 const text=$('#draft').value.trim();if(!text){tell('Напиши повідомлення');return}
 const minutes=Number(prompt('Через скільки хвилин надіслати? (1–120)','1'));
 if(!Number.isFinite(minutes)||minutes<1||minutes>120){tell('Потрібно від 1 до 120 хвилин');return}
 const start=now()+Math.ceil(minutes)*60000;const id=c.id;
 tell('Заплановано локально; залиш відкритою цю вкладку');$('#draft').value='';resizeDraft();
 setTimeout(()=>{const target=byId(id);if(target){target.messages.push({id:uid(),text,time:now(),mine:true,type:'text',reactions:{}});save();if(active===id)renderMessages();renderList()}},start-now());
}

/* Connect widgets and persist non-sensitive local-demo preferences. */
function handleFile(file){if(!file)return;attachLocal(file)}
function attachLocal(file){
 if(file.size>25*1024*1024){tell('У Studio максимальний розмір вкладення 25 МБ; для великих файлів потрібен сервер');return}
 const c=chat();if(!c)return;
 const type=file.type.startsWith('image/')?'photo':file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':'file';
 const url=type==='file'?null:URL.createObjectURL(file);
 const id=uid();if(url)localAttachments.set(id,url);
 c.messages.push({id,text:type==='file'?'📎 '+file.name:'',url,type,time:now(),mine:true,reactions:{}});
 save();renderMessages();renderList();
 tell('Файл у локальному демочаті. Медіавкладення не зберігається після перезавантаження.');
}
function stopMedia(){window.ClouxStudioMedia?.stop?.();$('#media-modal').hidden=true}
async function camera(){
 await window.ClouxStudioMedia.camera({
  target:$('#media-modal'),
  onFile:handleFile,
  onState:message=>{const s=$('#cloux-camera-status');if(s)s.textContent=message},
  onError:tell
 });
}
async function voice(){
 if(window.ClouxStudioMedia.isRecording()){window.ClouxStudioMedia.finishVoice();return}
 $('#send').textContent='■';
 const ok=await window.ClouxStudioMedia.voice({
  onFile:handleFile,
  onLevel:level=>{$('#send').style.boxShadow='0 0 '+(17+level*130)+'px #ff1a1a'},
  onState:message=>{if(message==='Запис зупинено'){$('#send').textContent='●';$('#send').style.boxShadow='';tell('Запис завершено')}else{$('#send').title=message}},
  onError:t=>{tell(t);$('#send').textContent='●'}
 });
 if(ok)tell('Запис голосового. Натисни ■ для завершення.');
}
function callNow(mode){
 if(!active){tell('Спочатку відкрий чат');return}
 const current=chat();
 if(current?.kind==='channel'){tell('У каналі немає особистих дзвінків');return}
 void window.ClouxStudioCalls.start({
  target:$('#call-screen'),room:active,title:current?.name||'Cloux',
  mode,toast:tell
 });
}
function searchMessages(){
 const q=prompt('Знайти повідомлення в цьому чаті');if(!q?.trim())return;
 const c=chat(),found=c?.messages.find(m=>String(m.text||'').toLocaleLowerCase('uk').includes(q.toLocaleLowerCase('uk')));
 if(!found){tell('Нічого не знайдено');return}
 const node=$('[data-message="'+found.id+'"]');node?.scrollIntoView({behavior:'smooth',block:'center'});
 if(node){node.classList.add('selected');setTimeout(()=>node.classList.remove('selected'),1600)}
}
function showMenu(){
 sheet('Cloux Studio',[
  {label:'✉ Новий локальний демочат',run:createChat},
  {label:'⚙ Налаштування Studio',run:settings},
  {label:'📦 Запланувати повідомлення локально',run:scheduleMessage},
  {label:'🗂 Відкрити архів',run:()=>{filter='archived';syncFilter();backChat()}},
  {label:'↗ Справжній Cloux',run:()=>{window.location.href='/v5/'}}
 ],'<p>Це окрема демонстрація інтерфейсу. Повідомлення в демочатах не надсилаються іншим людям.</p>');
}
function syncFilter(){
 $$('#folders button').forEach(b=>b.classList.toggle('selected',b.dataset.filter===filter));renderList();
}
function setup(){
 $('#chat-view').hidden=true;$('#welcome').hidden=false;active=null;
 renderStories();renderList();syncFilter();
 $('#back-chat').onclick=backChat;
 $('#sidebar-menu').onclick=showMenu;
 $('#new-chat').onclick=createChat;
 $('#preferences').onclick=settings;
 $('#chat-options').onclick=openChatMenu;
 $('#chat-search').onclick=searchMessages;
 $('#call-audio').onclick=()=>callNow('audio');
 $('#call-video').onclick=()=>callNow('video');
 $('#emoji-open').onclick=()=>emojiPicker(e=>{const d=$('#draft');const start=d.selectionStart??d.value.length;const end=d.selectionEnd??d.value.length;d.value=d.value.slice(0,start)+e+d.value.slice(end);d.focus();d.setSelectionRange(start+e.length,start+e.length);resizeDraft();if(chat()){db.drafts[active]=d.value;save()}});
 $('#camera').onclick=()=>void camera();
 $('#attach').onclick=()=>$('#attachment-input').click();
 $('#attachment-input').onchange=e=>{const file=e.target.files?.[0];handleFile(file);e.target.value=''};
 $('#send').onclick=()=>{if($('#draft').value.trim())sendText();else void voice()};
 const draft=$('#draft');
 draft.oninput=()=>{resizeDraft();if(chat()){db.drafts[active]=draft.value;save()}};
 draft.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText()}if(e.key==='Escape'){replyId=null;editId=null;updateReply()}};
 $('#search').oninput=e=>{query=e.target.value.trim().toLocaleLowerCase('uk');renderList()};
 $$('#folders button').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;syncFilter()});
 $('#scroll-bottom').onclick=()=>{$('#chat-wall').scrollTo({top:$('#chat-wall').scrollHeight,behavior:'smooth'})};
 $('#chat-wall').onscroll=()=>{
  const wall=$('#chat-wall');
  $('#scroll-bottom').style.opacity=wall.scrollHeight-wall.clientHeight-wall.scrollTop>250?'1':'.25';
 };
 let pointerTimer=0,longTriggered=false,pointerX=0,pointerY=0,suppressClick=false;
 $('#send').addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch'||draft.value.trim())return;
  pointerX=e.clientX;pointerY=e.clientY;longTriggered=false;
  pointerTimer=window.setTimeout(()=>{longTriggered=true;suppressClick=true;void voice()},350);
 });
 $('#send').addEventListener('pointermove',e=>{
  if(e.pointerType!=='touch'||!longTriggered||!window.ClouxStudioMedia?.isRecording())return;
  if(e.clientX-pointerX< -85){window.ClouxStudioMedia.cancelVoice();tell('Голосове скасовано');longTriggered=false}
  else if(e.clientY-pointerY< -75){longTriggered=false;tell('🔒 Запис закріплено — натисни ■ для завершення')}
 });
 $('#send').addEventListener('pointerup',e=>{
  clearTimeout(pointerTimer);
  if(e.pointerType==='touch'&&longTriggered&&window.ClouxStudioMedia?.isRecording()){window.ClouxStudioMedia.finishVoice();longTriggered=false;suppressClick=true}
 });
 $('#send').addEventListener('pointercancel',()=>clearTimeout(pointerTimer));
 $('#send').addEventListener('click',e=>{if(suppressClick){e.stopImmediatePropagation();e.preventDefault();suppressClick=false}},true);
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(window.ClouxStudioCalls?.active())window.ClouxStudioCalls.end();else if(!$('#shade').hidden)closeOverlays();else if(active)backChat()}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus();if(active)backChat()}
  if((e.ctrlKey||e.metaKey)&&['b','i'].includes(e.key.toLowerCase())&&document.activeElement===draft){
   e.preventDefault();const start=draft.selectionStart,end=draft.selectionEnd;if(start===end)return;
   const wrapper=e.key.toLowerCase()==='b'?'**':'*';
   draft.setRangeText(wrapper+draft.value.slice(start,end)+wrapper,start,end,'end');resizeDraft();
  }
  if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)&&active){
   e.preventDefault();const arr=filteredChats(),i=arr.findIndex(x=>x.id===active),c=arr[i+(e.key==='ArrowUp'?-1:1)];if(c)openChat(c.id)
  }
  if(e.key==='ArrowUp'&&!draft.value&&document.activeElement===draft&&chat()){
   const last=[...chat().messages].reverse().find(x=>x.mine&&x.type==='text');
   if(last){editId=last.id;draft.value=last.text;updateReply();resizeDraft()}
  }
 });
 document.addEventListener('dragover',e=>e.preventDefault());
 document.addEventListener('drop',e=>{
  if(!active||!e.dataTransfer?.files.length)return;
  e.preventDefault();handleFile(e.dataTransfer.files[0]);
 });
 window.addEventListener('resize',slideFolderIndicator);
 window.addEventListener('storage',e=>{if(e.key==='cloux:studio:6'&&e.newValue){try{db=JSON.parse(e.newValue);renderList();if(active&&byId(active))renderMessages()}catch{}}});
 if('serviceWorker' in navigator&&window.isSecureContext&&location.protocol!=='file:'){
   navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
 }
 const banner=$('#update-banner');
 $('#update-now').onclick=async()=>{
  const waiting=(await navigator.serviceWorker?.getRegistration?.('/'))?.waiting;
  if(waiting){waiting.postMessage({type:'SKIP_WAITING'})}else location.reload();
 };
 if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{banner.hidden=false});
 }
 resizeDraft();
}
setup();
})();
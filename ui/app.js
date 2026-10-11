/** Cloux main application: responsive conversation layout and accessible controls. */
import {S,$,$$,esc,api,post,patch,toast,ago,renderEmoji,BASE_AVATAR,makeAvatar,loadLocal,saveLocal,cachedPhoto,cachePhoto,shortText,withError} from './core.js';
import {createEmojiPicker} from './emoji.js';
import {cropAndUpload,getPhotoUrl} from './avatar.js';
import {startCall} from './calls.js';

const NAV=[['chats','💬','Чати'],['contacts','👥','Контакти'],['servers','▦','Сервери'],['settings','⚙️','Налашт.'],['profile','◉','Профіль']];
let timer=null,heartbeat=null,rendered='',emojiPicker=null,recording=null,profileAvatar=BASE_AVATAR,profileBanner=null;
const icon=()=>BASE_AVATAR;
const openImg=(url,size='')=>`<img class="avatar ${size}" src="${esc(url||BASE_AVATAR)}" alt="Аватар" loading="lazy" onerror="this.onerror=null;this.src='${BASE_AVATAR}'">`;
function syncTheme(){
 const p={...S.prefs,...S.local};
 const theme=p.theme||'dark',accent=p.accent||'#F5F5F5';
 document.body.dataset.theme=theme;
 document.body.classList.toggle('no-glass',p.glass===0||p.glass===false);
 document.body.classList.toggle('square-bubbles',p.bubble_style==='square');
 document.body.classList.toggle('reduced-motion',p.animations===0||p.animations===false);
 document.documentElement.style.setProperty('--accent',accent);
 document.documentElement.style.setProperty('--font',(p.font_size||15)+'px');
 document.documentElement.style.setProperty('--blur',p.glass===false?'0px':'22px');
 document.documentElement.style.setProperty('--wallpaper-blur',(p.wallpaper_blur||0)+'px');
 document.documentElement.style.setProperty('--wallpaper-brightness',(1-(p.wallpaper_dim||0)/100).toString());
 document.documentElement.style.setProperty('--wallpaper-image',S.local.wallpaper==='custom'&&S.local.customWallpaperUrl?`url("${S.local.customWallpaperUrl}")`:'none');
}
function navigate(tab){S.tab=tab;S.current=null;S.reply=null;rendered='';emojiPicker?.close();emojiPicker=null;
 const shell=$('.shell');shell?.classList.remove('mobile-chat','mobile-page');if(tab!=='chats')shell?.classList.add('mobile-page');
 renderSidebar();if(tab==='chats')renderWelcome();else if(tab==='contacts')renderContacts();else if(tab==='servers')renderServers();else if(tab==='settings')renderSettings();else if(tab==='profile')renderProfile();
}
function navHTML(){return `<nav class="bottom-nav" aria-label="Головна навігація">${NAV.map(([id,ic,title])=>`<button data-nav="${id}" aria-label="${id==='settings'?'Налаштування':title}" class="${S.tab===id?'active':''}"><span class="navicon">${ic}</span>${title}</button>`).join('')}</nav>`}
function renderSidebar(){
 const side=$('#sidebar');if(!side)return;
 side.innerHTML=`<header class="side-head"><img src="${BASE_AVATAR}" style="height:39px;width:39px;border-radius:12px" alt="Cloux"><strong class="wordmark">Cloux.</strong><button class="icon-btn" data-create title="Створити чат">＋</button></header>
 <div class="side-search"><input data-search placeholder="Пошук чатів та людей" aria-label="Пошук"></div>
 <div class="tabs-filter">${[['all','Усі'],['direct','Особисті'],['group','Групи'],['channel','Канали'],['archived','Архів']].map(([key,label])=>`<button data-filter="${key}" class="${S.filter===key?'active':''}">${label}</button>`).join('')}</div>
 <section class="chat-list" id="chat-list" aria-label="Список чатів"></section>`;
 const shell=$('.shell');let nav=shell.querySelector('.bottom-nav');if(!nav){nav=document.createElement('nav');shell.append(nav)}nav.outerHTML=navHTML();$$('[data-nav]',shell).forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
 $('[data-create]',side).onclick=createConversation;
 $$('[data-filter]',side).forEach(b=>b.onclick=()=>{S.filter=b.dataset.filter;renderSidebar()});
 $('[data-search]',side).oninput=e=>renderChats(e.target.value);
 renderChats();renderEmoji(side);
}
function renderChats(query=''){
 const list=$('#chat-list');if(!list)return;
 let chats=S.chats.filter(x=>S.filter==='archived'?x.archived:S.filter==='all'?!x.archived:(x.kind===S.filter&&!x.archived));
 if(query.trim())chats=chats.filter(x=>`${x.title} ${x.last_text}`.toLowerCase().includes(query.toLowerCase()));
 if(!chats.length){list.innerHTML='<div class="empty">Тут поки немає чатів.<br>Створи групу або знайди друга в «Контактах».</div>';return}
 list.innerHTML=chats.map(c=>`<button class="chat-item ${S.current?.id===c.id?'active':''}" data-open-chat="${esc(c.id)}">
  ${openImg(c.kind==='direct'&&c.other_id?'/api/profile/'+encodeURIComponent(c.other_id)+'/media/avatar':(c.avatar_url||BASE_AVATAR))}<span class="chat-info"><span class="chat-info-top"><strong>${c.pinned?'📌 ':''}${esc(c.title)}</strong><small>${ago(c.last_time)}</small></span>
  <p>${c.muted?'🔕 ':''}${esc((S.prefs.show_previews===0||S.local.show_previews===false)?'Повідомлення приховані':shortText(c.last_text||'Нова розмова'))}</p></span></button>`).join('');
 $$('[data-open-chat]',list).forEach(b=>b.onclick=()=>openChat(b.dataset.openChat));renderEmoji(list);
}
function renderWelcome(){const main=$('#main');if(!main)return;main.innerHTML=`<div class="loading"><img src="${BASE_AVATAR}" alt="Cloux"><h2>Cloux Messenger</h2><p>Вибери розмову зліва або відкрий вкладку «Контакти».</p></div>`}
async function refreshChats(){if(!S.me)return;try{S.chats=(await api('/api/chats')).chats;renderChats()}catch(err){console.warn('refresh chats',err)}}
function goBack(){S.current=null;S.reply=null;rendered='';emojiPicker?.close();emojiPicker=null;$('.shell')?.classList.remove('mobile-chat','mobile-page');renderSidebar();renderWelcome()}
function heading(title,subtitle='',extra=''){
 return `<header class="chat-top"><button class="icon-btn mobile-back" data-back aria-label="Назад">←</button><span class="chat-title"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span>${extra}</header>`;
}
async function openChat(cid){
 const c=S.chats.find(x=>x.id===cid);if(!c){await refreshChats();return}
 S.tab='chats';S.current=c;S.reply=null;rendered='';S.messages=[];S.reactions={};S.reads={};emojiPicker?.close();emojiPicker=null;
 $('.shell')?.classList.add('mobile-chat');$('.shell')?.classList.remove('mobile-page');renderSidebar();
 const title=`${c.title}`;const main=$('#main');
 main.innerHTML=heading(title,({saved:'Тільки для тебе',news:'Офіційні новини',group:'Група',channel:'Канал',direct:'Особистий чат'})[c.kind]||'',`<button class="icon-btn" data-action="search-chat" title="Пошук">⌕</button>${c.kind==='direct'?'<button class="icon-btn" data-action="audio-call" title="Голосовий дзвінок">☎</button><button class="icon-btn" data-action="video-call" title="Відеодзвінок">▣</button>':''}<button class="icon-btn" data-action="chat-menu" title="Меню чату">⋮</button>`)+
 `<div class="chat-wall" data-wall="${esc(S.local.wallpaper||S.prefs.wallpaper||'dots')}"><div class="messages" id="messages" aria-live="polite"></div></div>${c.kind==='news'||(c.kind==='channel'&&!c.is_owner)?'<div class="notice" style="margin:0;text-align:center">У цей канал можуть писати тільки адміністратори</div>':`<div id="reply-slot"></div><form class="composer" id="composer"><button type="button" class="icon-btn" data-emoji title="Емодзі та стікери">☺</button><button type="button" class="icon-btn" data-attach title="Фото та файли">⌁</button><textarea id="draft" maxlength="4000" rows="1" aria-label="Повідомлення" placeholder="Повідомлення…"></textarea><button type="button" class="icon-btn" data-voice title="Записати голосове">🎙</button><button type="submit" class="send" title="Надіслати">➤</button><input type="file" id="attach-file" class="hidden" accept="image/jpeg,image/png,image/webp,image/gif,audio/webm,audio/mpeg,video/webm,video/mp4,application/pdf"></form>`}`;
 $('[data-back]',main).onclick=goBack;
 $('[data-action="search-chat"]',main).onclick=()=>renderMessageSearch(cid);
 $('[data-action="chat-menu"]',main).onclick=()=>chatMenu(c);
 $('[data-action="audio-call"]',main)?.addEventListener('click',()=>startCall(c,false));
 $('[data-action="video-call"]',main)?.addEventListener('click',()=>startCall(c,true));
 if($('#composer')){
  $('#composer').onsubmit=withError(sendMessage);
  $('#draft').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#composer').requestSubmit()}};
  $('[data-emoji]').onclick=()=>toggleEmoji();
  $('[data-attach]').onclick=()=>$('#attach-file').click();
  $('#attach-file').onchange=withError(fileSelected);
  $('[data-voice]').onclick=withError(recordVoice);
 }
 syncTheme();await updateMessages(true);renderEmoji(main);await post('/api/chats/'+encodeURIComponent(cid)+'/read').catch(()=>{});
}
async function updateMessages(initial=false){if(!S.current)return;const cid=S.current.id;try{
 const msgs=(await api('/api/chats/'+encodeURIComponent(cid)+'/messages')).messages;
 if(S.current?.id!==cid)return;
 const signatures=msgs.map(m=>[m.id,m.text,m.reply_to,m.attachment_id].join(':')).join('|');
 const [reactions,reads]=await Promise.all([api('/api/chats/'+encodeURIComponent(cid)+'/reactions').catch(()=>({reactions:{}})),api('/api/chats/'+encodeURIComponent(cid)+'/read-status').catch(()=>({reads:{}}))]);
 const reactionSig=JSON.stringify(reactions.reactions);const readSig=JSON.stringify(reads.reads);
 if(!initial&&signatures===rendered&&reactionSig===JSON.stringify(S.reactions)&&readSig===JSON.stringify(S.reads))return;
 S.messages=msgs;S.reactions=reactions.reactions;S.reads=reads.reads;rendered=signatures;drawMessages();
 await post('/api/chats/'+encodeURIComponent(cid)+'/read').catch(()=>{});
 }catch(e){console.warn('messages',e)}}
function drawMessages(){const holder=$('#messages');if(!holder||!S.current)return;
 const closeToBottom=holder.scrollHeight-holder.scrollTop-holder.clientHeight<160;
 const cid=S.current.id;
 holder.replaceChildren();
 for(const m of S.messages){const own=m.sender===S.me.id;const node=document.createElement('article');node.className='message'+(own?' own':'');node.dataset.mid=m.id;
  let text=esc(m.text),sticker=false;
  if(text.startsWith('[стікер]')){text=esc(m.text.slice(8));sticker=true}
  const html=`${!own?'<div class="author">'+esc(m.display)+'</div>':''}
  ${m.forwarded_from?'<div class="quote">↗ Переслано від @'+esc(m.forwarded_from)+'</div>':''}
  ${m.reply_to?'<div class="quote">↩ '+esc(m.reply_author||'Користувач')+': '+esc(m.reply_text||'Видалено')+'</div>':''}
  <div class="txt ${sticker?'sticker-img':''}">${text}</div>${mediaHTML(m,cid)}<div class="meta">${ago(m.created)} ${own?(Object.entries(S.reads).some(([uid,last])=>uid!==S.me.id&&last>=m.id)?'✓✓':'✓'):''}</div>
  <div class="react-list">${Object.entries(S.reactions[String(m.id)]||{}).map(([emoji,r])=>`<button data-reaction="${esc(emoji)}" class="${r.me?'selected':''}">${emoji} ${r.count}</button>`).join('')}</div>
  <div class="actions"><button data-act="react" title="Реакції">♡</button>${S.current.kind!=='news'?'<button data-act="reply">↩</button>':''}<button data-act="forward">↗</button>${own&&S.current.kind!=='news'?'<button data-act="edit">✎</button><button data-act="delete">✕</button>':''}</div>`;
  node.innerHTML=html;
  $$('[data-act]',node).forEach(b=>b.onclick=withError(()=>messageAction(m,b.dataset.act)));
  $$('[data-reaction]',node).forEach(b=>b.onclick=withError(async()=>{await post('/api/messages/'+m.id+'/reactions',{emoji:b.dataset.reaction});rendered='';await updateMessages()}));
  holder.append(node);
 }
 renderEmoji(holder);
 if(closeToBottom)holder.scrollTop=holder.scrollHeight;
}
function mediaHTML(m,cid){if(!m.attachment_id||!m.media_mime)return '';
 const url=`/api/chats/${encodeURIComponent(cid)}/media/${encodeURIComponent(m.attachment_id)}`;
 if(m.media_mime.startsWith('image/'))return `<img class="msg-photo" loading="lazy" src="${url}" alt="Вкладене фото">`;
 if(m.media_mime.startsWith('audio/'))return `<audio class="msg-media" controls preload="none" src="${url}"></audio>`;
 if(m.media_mime.startsWith('video/'))return `<video class="msg-media" controls preload="none" playsinline src="${url}"></video>`;
 return `<p><a class="outline" href="${url}" target="_blank" rel="noopener">⬇ ${esc(m.media_filename||'Завантажити файл')}</a></p>`;
}
async function messageAction(m,action){
 if(action==='react'){openReactionPicker(m.id);return}
 if(action==='reply'){S.reply=m;showReply();$('#draft')?.focus();return}
 if(action==='edit'){const val=prompt('Редагувати повідомлення:',m.text);if(val===null||!val.trim())return;await patch('/api/messages/'+m.id,{text:val.trim()});rendered='';await updateMessages();return}
 if(action==='delete'){if(!confirm('Видалити повідомлення?'))return;await api('/api/messages/'+m.id,{method:'DELETE'});rendered='';await updateMessages();return}
 if(action==='forward'){
  const chats=S.chats.filter(c=>c.kind!=='news'&&(c.kind!=='channel'||c.is_owner));const choice=prompt('Переслати в який чат? Вкажи номер:\n'+chats.map((x,i)=>`${i+1}. ${x.title}`).join('\n'));
  const dest=chats[Number(choice)-1];if(!dest){if(choice!==null)toast('Не знайдено чат');return}
  await post(`/api/chats/${encodeURIComponent(S.current.id)}/forward/${m.id}`,{target_chat_id:dest.id});toast('Повідомлення переслано');await refreshChats();
 }
}
function showReply(){const slot=$('#reply-slot');if(!slot)return;slot.innerHTML=S.reply?`<div class="reply-banner"><span>↩ ${esc(S.reply.display||'Повідомлення')}: ${esc(shortText(S.reply.text))}</span><button type="button" data-clear>✕</button></div>`:'';if($('[data-clear]',slot))$('[data-clear]',slot).onclick=()=>{S.reply=null;showReply()}}
async function sendMessage(e){e.preventDefault();if(!S.current)return;const field=$('#draft');const text=field.value.trim();if(!text)return;field.disabled=true;
 try{if(S.reply)await post(`/api/chats/${encodeURIComponent(S.current.id)}/reply/${S.reply.id}`,{text});else await post(`/api/chats/${encodeURIComponent(S.current.id)}/messages`,{text});
  field.value='';S.reply=null;showReply();rendered='';await updateMessages();await refreshChats();
 }finally{field.disabled=false;field.focus()}
}
function toggleEmoji(sticker=false){if(emojiPicker){emojiPicker.close();emojiPicker=null;return}
 const target=$('.chat-wall');if(!target)return;
 emojiPicker=createEmojiPicker(target,async(emoji,isSticker)=>{
  if(isSticker){await post(`/api/chats/${encodeURIComponent(S.current.id)}/messages`,{text:'[стікер]'+emoji});await updateMessages();emojiPicker?.close();emojiPicker=null}
  else{$('#draft').value+=emoji;$('#draft').focus()}
 });
 const stickers=document.createElement('button');stickers.textContent='Стікери';stickers.className='outline';stickers.onclick=()=>{const p=emojiPicker;emojiPicker?.close();emojiPicker=createEmojiPicker(target,async emoji=>{await post(`/api/chats/${encodeURIComponent(S.current.id)}/messages`,{text:'[стікер]'+emoji});emojiPicker?.close();emojiPicker=null;rendered='';await updateMessages()},true)};
 emojiPicker.element.prepend(stickers);
}
function openReactionPicker(mid){const target=$('.chat-wall');emojiPicker?.close();emojiPicker=createEmojiPicker(target,async emoji=>{await post('/api/messages/'+mid+'/reactions',{emoji});emojiPicker?.close();emojiPicker=null;rendered='';await updateMessages()});}
async function uploadMedia(file){if(!S.current||!file)return;
 if(file.size>5*1024*1024)throw new Error('Максимальний розмір вкладення — 5 МБ');
 const resp=await fetch(`/api/chats/${encodeURIComponent(S.current.id)}/media`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type,'X-Cloux-Filename':encodeURIComponent(file.name||'Запис')},body:file});
 let result=await resp.json().catch(()=>({}));if(!resp.ok)throw new Error(result.detail||'Помилка надсилання');rendered='';await updateMessages();await refreshChats();
}
async function fileSelected(e){const f=e.target.files[0];e.target.value='';if(f)await uploadMedia(f)}
async function recordVoice(){if(recording){recording.stop();return}
 if(!window.MediaRecorder||!navigator.mediaDevices?.getUserMedia){toast('Тут немає запису голосових');return}
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg'].find(x=>MediaRecorder.isTypeSupported(x));if(!mime){stream.getTracks().forEach(t=>t.stop());toast('Кодек не підтримується');return}
 const rec=new MediaRecorder(stream,{mimeType:mime}),chunks=[];recording=rec;$('[data-voice]').textContent='■';
 rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
 rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());recording=null;if($('[data-voice]'))$('[data-voice]').textContent='🎙';
  const blob=new File(chunks,['voice.webm'],{type:mime.split(';')[0]});try{await uploadMedia(blob)}catch(err){toast(err.message)}};
 rec.start(1000);setTimeout(()=>{if(rec.state==='recording')rec.stop()},55_000);
}
function chatMenu(c){const a=prompt(`Чат «${c.title}»:\n1 — Закріпити/відкріпити\n2 — Архівувати/повернути\n3 — Вимкнути/включити сповіщення\n4 — Скопіювати запрошення (група/канал)`,'1');
 const key=({'1':'pinned','2':'archived','3':'muted'})[a];if(key){post('/api/chats/'+c.id+'/preferences',{[key]:!c[key]}).then(async()=>{await refreshChats();if(a==='2')goBack();else{c[key]=!c[key];toast('Налаштування збережено')}}).catch(e=>toast(e.message))}
 else if(a==='4'&&['group','channel'].includes(c.kind)){post('/api/chats/'+c.id+'/invite').then(r=>navigator.clipboard.writeText(r.link).then(()=>toast('Посилання скопійовано')).catch(()=>prompt('Скопіюй посилання:',r.link))).catch(e=>toast(e.message))}
}
async function createConversation(){const type=prompt('1 — нова група\n2 — новий канал\n3 — знайти користувача','1');if(type==='3'){navigate('contacts');return}
 if(type!=='1'&&type!=='2')return;const title=prompt(type==='1'?'Назва групи:':'Назва каналу:');if(!title||title.trim().length<2)return;
 try{const url=type==='1'?'/api/groups':'/api/channels';const r=await post(url,type==='1'?{title:title.trim(),members:[]}:{title:title.trim()});await refreshChats();openChat(r.chat_id)}catch(e){toast(e.message)}
}
function renderMessageSearch(cid=null){const root=$('#main');$('.shell')?.classList.add('mobile-page');$('.shell')?.classList.remove('mobile-chat');root.innerHTML=heading('Пошук повідомлень')+`<div class="page"><input id="msg-query" placeholder="Текст повідомлення" autofocus><div id="msg-results"></div></div>`;$('[data-back]',root).onclick=goBack;
 let token;$('#msg-query').oninput=e=>{clearTimeout(token);token=setTimeout(async()=>{const q=e.target.value.trim();if(q.length<2)return;try{const data=await api('/api/messages/search?q='+encodeURIComponent(q));$('#msg-results').innerHTML=data.messages.filter(x=>!cid||x.chat_id===cid).map(x=>`<button class="chat-item" data-goto="${esc(x.chat_id)}"><span class="chat-info"><strong>${esc(x.chat_title)}</strong><p>${esc(x.text)}</p></span></button>`).join('')||'<p class="empty">Нічого не знайдено</p>';$$('[data-goto]').forEach(b=>b.onclick=()=>openChat(b.dataset.goto))}catch(e){toast(e.message)}},300)};
}
function page(title,html){const main=$('#main');main.innerHTML=heading(title)+`<section class="page">${html}</section>`;
 $('[data-back]',main)?.addEventListener('click',goBack);$('.shell')?.classList.add('mobile-page');$('.shell')?.classList.remove('mobile-chat');renderEmoji(main);
}
async function renderContacts(q=''){
 page('Контакти',`<div class="setting-group"><h3>Знайти людину в Cloux</h3><input id="people-query" aria-label="Пошук людей" placeholder="Імʼя або @позивний" value="${esc(q)}"><div id="people-results" class="members"><p class="muted small">Введи мінімум 2 символи. Cloux не читає контакти телефона.</p></div></div>`);
 let timer;$('#people-query').oninput=e=>{clearTimeout(timer);timer=setTimeout(()=>search(e.target.value),250)};
 async function search(value){const target=$('#people-results');if(value.trim().length<2){target.innerHTML='<p class="muted small">Введи два символи.</p>';return}
  const d=await api('/api/users?q='+encodeURIComponent(value.trim()));target.innerHTML=d.users.map(u=>`<button class="member" data-contact="${esc(u.id)}">${openImg('/api/profile/'+encodeURIComponent(u.id)+'/media/avatar','sm')}<span style="flex:1;text-align:left"><strong>${esc(u.display)}</strong><br><small class="muted">@${esc(u.username)}</small></span><span>Написати →</span></button>`).join('')||'<div class="empty">Нікого не знайдено</div>';
  $$('[data-contact]',target).forEach(b=>b.onclick=withError(async()=>{const d=await post('/api/direct/'+encodeURIComponent(b.dataset.contact));await refreshChats();openChat(d.chat_id)}));renderEmoji(target);
 }
 if(q)await search(q);
}
async function renderServers(){page('Сервери',`<div class="setting-group"><h3>Спільноти Cloux</h3><p class="muted small">Сервери з текстовими каналами, ролями та учасниками онлайн.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="primary" id="new-server">＋ Створити сервер</button><button class="outline" id="join-server">↗ Приєднатися</button></div></div><div class="server-list" id="servers-list"></div>`);
 $('#new-server').onclick=withError(async()=>{const name=prompt('Назва сервера:');if(!name?.trim())return;const description=prompt('Опис сервера (необов’язково):','')||'';await post('/api/servers',{name,description});await renderServers()});
 $('#join-server').onclick=withError(async()=>{const invite=prompt('Код запрошення до сервера:');if(!invite)return;const r=await post('/api/servers/join/'+encodeURIComponent(invite));await showServer(r.server_id)});
 try{const {servers}=await api('/api/servers');$('#servers-list').innerHTML=servers.length?servers.map(s=>`<button class="server-card" data-server="${esc(s.id)}"><span style="font-size:31px">▦</span><strong>${esc(s.name)}</strong><small class="muted">${s.member_count} учасників · ${esc(s.role)}</small><p class="muted small">${esc(s.description)}</p></button>`).join(''):'<p class="empty">Тут ще немає серверів. Створи перший або приєднайся за кодом.</p>';
 $$('[data-server]').forEach(b=>b.onclick=()=>showServer(b.dataset.server));}catch(e){toast(e.message)}
}
async function showServer(sid){try{const {server,channels,members}=await api('/api/servers/'+encodeURIComponent(sid));S.server=server;
 page(server.name,`<div class="setting-group"><h3>${esc(server.name)}</h3><p class="muted">${esc(server.description)}</p><p class="small">Роль: <strong>${esc(server.role)}</strong> · Онлайн: ${members.filter(m=>m.online).length}/${members.length}</p>
 ${server.invite_code?`<button class="outline" id="share-code">🔗 Скопіювати запрошення</button>`:''}
 ${['owner','admin'].includes(server.role)?'<button class="primary" style="margin-left:8px" id="new-channel">＋ Новий канал</button>':''}</div>
 <div class="setting-group"><h3>Текстові канали</h3>${channels.map(c=>`<button class="chat-item" data-server-channel="${esc(c.id)}"><span style="font-size:22px">#</span><strong>${esc(c.title)}</strong></button>`).join('')||'<p class="muted small">Каналів ще немає</p>'}</div>
 <div class="setting-group"><h3>Учасники онлайн та ролі</h3><div class="members">${members.map(m=>`<div class="member"><span class="dot ${m.online?'online':''}"></span>${openImg(BASE_AVATAR,'sm')}<span style="flex:1"><strong>${esc(m.display)}</strong><br><small class="muted">@${esc(m.username)} · ${esc(m.role)}</small></span>${server.role==='owner'&&m.role!=='owner'?`<button class="outline" data-role-user="${esc(m.id)}" data-current-role="${esc(m.role)}">Роль ▾</button>`:''}</div>`).join('')}</div></div>`);
 $$('[data-server-channel]').forEach(b=>b.onclick=withError(async()=>{await refreshChats();await openChat(b.dataset.serverChannel)}));
 $('#share-code')?.addEventListener('click',()=>navigator.clipboard.writeText(server.invite_code).then(()=>toast('Код скопійовано')).catch(()=>prompt('Код запрошення:',server.invite_code)));
 $('#new-channel')?.addEventListener('click',withError(async()=>{const name=prompt('Назва нового текстового каналу:');if(!name)return;await post('/api/servers/'+sid+'/channels',{name});await showServer(sid)}));
 $$('[data-role-user]').forEach(b=>b.onclick=withError(async()=>{const role=prompt('Роль користувача: admin або member',b.dataset.currentRole);if(!['admin','member'].includes(role))return;await patch('/api/servers/'+sid+'/members/'+b.dataset.roleUser,{role});await showServer(sid)}));
 renderEmoji($('#main'));
 }catch(e){toast(e.message)}}
function row(label,ctrl,small=''){return `<div class="setting-row"><label><strong>${label}</strong>${small?`<br><small>${small}</small>`:''}</label>${ctrl}</div>`}
function settingSection(title,inner){return `<section class="setting-group"><h3>${title}</h3>${inner}</section>`}
async function savePrefs(d){S.prefs={...S.prefs,...d};saveLocal(d);syncTheme();await patch('/api/preferences',d).catch(e=>console.warn('server prefs',e))}
function themeControl(){const p={...S.prefs,...S.local};return settingSection('Теми й оформлення',
 row('Режим',`<select id="theme"><option value="dark" ${p.theme!=='light'?'selected':''}>Темна</option><option value="light" ${p.theme==='light'?'selected':''}>Світла</option></select>`)+
 row('Акцентний колір',`<input type="color" id="accent" value="${esc(p.accent||'#F5F5F5')}">`)+
 row('Скляна нижня панель',`<input type="checkbox" id="glass" ${p.glass!==false&&p.glass!==0?'checked':''}>`)+
 row('Розмір тексту',`<input type="range" id="font-size" min="13" max="21" value="${Number(p.font_size||15)}">`)+
 row('Компактний режим',`<input type="checkbox" id="compact" ${p.compact?'checked':''}>`)+
 row('Форма повідомлень',`<select id="bubble-style"><option value="rounded" ${p.bubble_style!=='square'?'selected':''}>Заокруглені</option><option value="square" ${p.bubble_style==='square'?'selected':''}>Квадратні</option></select>`)+
 row('Анімації',`<input type="checkbox" id="animations" ${p.animations!==false&&p.animations!==0?'checked':''}>`));}
function wallpaperControl(){const p={...S.prefs,...S.local};return settingSection('Шпалери повідомлень',
 `<p class="muted small">Готові фони або власне фото. Розмиття та затемнення зберігаються.</p><div class="preset-grid">${[['dots','Крапки'],['waves','Хвилі'],['plain','Однотонний'],['slate','Графіт'],['custom','Моє фото']].map(([id,name])=>`<button class="preset preset-${id} ${p.wallpaper===id?'selected':''}" data-wall="${id}" title="${name}"><span class="small">${name}</span></button>`).join('')}</div>`+
 row('Розмиття',`<input type="range" id="wall-blur" min="0" max="25" value="${Number(p.wallpaper_blur||0)}">`)+
 row('Затемнення',`<input type="range" id="wall-dim" min="0" max="80" value="${Number(p.wallpaper_dim||0)}">`)+
 `<button class="outline" id="wall-upload">📁 Завантажити шпалери з галереї</button><input type="file" id="wall-file" class="hidden" accept="image/png,image/jpeg,image/webp">`);}
function renderSettings(){S.tab='settings';const p={...S.prefs,...S.local};page('Налаштування Cloux',
 themeControl()+wallpaperControl()+settingSection('Сповіщення та приватність',
 row('Звуки та сповіщення',`<input type="checkbox" id="notify" ${p.notify?'checked':''}>`)+
 row('Попередній перегляд повідомлень',`<input type="checkbox" id="show-previews" ${p.show_previews!==0&&p.show_previews!==false?'checked':''}>`)+
 row('Показувати мене в пошуку',`<input type="checkbox" id="searchable" ${p.searchable!==false&&p.searchable!==0?'checked':''}>`)+
 row('Без анімацій',`<input type="checkbox" id="reduce-motion" ${p.animations===false||p.animations===0?'checked':''}>`)+
 `<button class="outline" id="notify-request">🔔 Дозволити браузерні сповіщення</button>`)+
 settingSection('Безпека та пристрої',`<button class="outline" id="device-list">Активні сеанси</button> <button class="outline" id="change-password">Змінити пароль</button> <button class="outline" id="logout">Вийти з акаунта</button>`)+
 `<div class="notice"><strong>Про зберігання даних.</strong> Власна тема й шпалери кешуються на цьому пристрої. Синхронізація на сервері поки не гарантує збереження після перезапуску безплатного Render. Немає SMS-перевірки та наскрізного шифрування. Фонові push-сповіщення ще не готові.</div>`);
 $('#theme').onchange=withError(saveTheme);
 $('#accent').onchange=withError(saveTheme);
 $('#glass').onchange=e=>savePrefs({glass:e.target.checked});
 $('#font-size').onchange=e=>savePrefs({font_size:+e.target.value});
 $('#compact').onchange=e=>savePrefs({compact:e.target.checked});
 $('#bubble-style').onchange=e=>savePrefs({bubble_style:e.target.value});
 $('#animations').onchange=e=>savePrefs({animations:e.target.checked});
 $('#notify').onchange=e=>savePrefs({notify:e.target.checked});
 $('#show-previews').onchange=e=>savePrefs({show_previews:e.target.checked});
 $('#searchable').onchange=e=>savePrefs({searchable:e.target.checked});
 $('#reduce-motion').onchange=e=>savePrefs({animations:!e.target.checked});
 $$('[data-wall]').forEach(b=>b.onclick=withError(async()=>{
  const wall=b.dataset.wall;if(wall==='custom'&&!S.local.customWallpaperUrl){$('#wall-file').click();return}
  saveLocal({wallpaper:wall});syncTheme();await patch('/api/preferences',{wallpaper:wall}).catch(()=>{});renderSettings();
 }));
 $('#wall-blur').onchange=withError(saveTheme);$('#wall-dim').onchange=withError(saveTheme);
 $('#wall-upload').onclick=()=>$('#wall-file').click();$('#wall-file').onchange=withError(async e=>{
  const file=e.target.files[0];if(!file)return;if(file.size>4_000_000)throw Error('Фото шпалер має бути менше 4 МБ');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Оберіть JPEG, PNG або WebP');
  await cachePhoto(`${S.me.id}-wallpaper`,file);
  const url=URL.createObjectURL(file);saveLocal({wallpaper:'custom',customWallpaperUrl:url});syncTheme();
  fetch('/api/profile/media/wallpaper',{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file}).catch(()=>{});
  renderSettings();toast('Шпалери встановлено');
 });
 $('#notify-request').onclick=()=>{if('Notification'in window)Notification.requestPermission().then(x=>toast('Дозвіл: '+x));else toast('Браузер не підтримує сповіщення')};
 $('#device-list').onclick=withError(async()=>{const d=await api('/api/devices');if(confirm('Активних сеансів: '+d.sessions+'. Завершити всі інші сеанси?')){await post('/api/devices/revoke-others');toast('Інші сеанси завершено')}});
 $('#change-password').onclick=withError(async()=>{const old=prompt('Старий пароль:');if(old===null)return;const nw=prompt('Новий пароль (8+ символів):');if(!nw||nw.length<8)return;await post('/api/password',{old,new:nw});toast('Пароль змінено')});
 $('#logout').onclick=withError(async()=>{await post('/api/logout');location.reload()});
}
async function saveTheme(){const p={...S.prefs,...S.local};const theme=$('#theme')?.value||p.theme||'dark';const accent=$('#accent')?.value||p.accent||'#F5F5F5';const wallpaper_blur=Number($('#wall-blur')?.value||p.wallpaper_blur||0),wallpaper_dim=Number($('#wall-dim')?.value||p.wallpaper_dim||12);
 saveLocal({theme,accent,wallpaper_blur,wallpaper_dim});syncTheme();await patch('/api/profile/theme',{theme,accent,wallpaper_blur,wallpaper_dim});toast('Оформлення збережено')}
async function renderProfile(){S.tab='profile';try{S.profile=(await api('/api/profile')).profile}catch(e){toast(e.message);return}
 const p=S.profile;page('Мій профіль',`<div class="profile-holder"><div class="profile-hero">${profileBanner?`<img class="profile-banner" src="${esc(profileBanner)}" alt="Банер" onerror="this.remove()">`:``}</div><img class="profile-avatar" src="${esc(profileAvatar)}" alt="Аватар"></div>
 <div class="profile-head"><div><h2>${esc(p.display)}</h2><p class="profile-status">@${esc(p.username)}</p></div><button class="outline" id="edit-avatar">📷 Аватар</button></div>
 <div style="display:flex;gap:8px;margin:14px 0"><button class="outline" id="edit-banner">Змінити банер</button><button class="outline" id="reset-avatar">Повернути стандартну аватарку</button></div>
 ${settingSection('Профіль',`<form id="profile-form" class="form"><label>Нікнейм<input name="display" maxlength="60" value="${esc(p.display)}" required></label><label>Позивний<input name="username" maxlength="24" value="${esc(p.username)}" required></label><label>Про мене<textarea name="bio" maxlength="180" rows="3">${esc(p.bio||'')}</textarea></label><label>Статус<input name="status" maxlength="90" value="${esc(S.local.status||S.prefs.status||'')}" placeholder="Наприклад: На зв’язку"></label><button class="primary" type="submit">Зберегти профіль</button></form>`)}
 ${settingSection('Мій Cloux',`<button class="outline" id="my-notes">📝 Нотатки</button> <button class="outline" id="cloux-news">📣 Новини Cloux</button>`)}<p class="muted small">Твоя аватарка доступна іншим користувачам, якщо файл ще зберігається на сервері.</p>`);
 $('#edit-avatar').onclick=()=>cropAndUpload('avatar',url=>{profileAvatar=url;renderProfile()});
 $('#edit-banner').onclick=()=>cropAndUpload('banner',url=>{profileBanner=url;renderProfile()});
 $('#reset-avatar').onclick=withError(async()=>{profileAvatar=BASE_AVATAR;saveLocal({avatar:'default'});const db=await import('./core.js');await db.deleteCachedPhoto(S.me.id+'-avatar');await api('/api/profile/media/avatar',{method:'DELETE'});renderProfile();toast('Повернуто стандартну аватарку Cloux')});
 $('#profile-form').onsubmit=withError(async e=>{e.preventDefault();const fd=new FormData(e.target);await patch('/api/profile',{display:fd.get('display'),username:fd.get('username'),bio:fd.get('bio')});await patch('/api/profile/status',{status:fd.get('status')});S.prefs.status=fd.get('status');saveLocal({status:fd.get('status')});await renderProfile();toast('Профіль збережено')});
 $('#my-notes').onclick=()=>openKind('saved');$('#cloux-news').onclick=()=>openKind('news');
}
function openKind(kind){const c=S.chats.find(x=>x.kind===kind);if(c)openChat(c.id);else toast('Чат ще не готовий')}
async function loginUI(register=false){const root=$('#app');root.innerHTML=`<main class="auth"><section class="auth-card"><div class="auth-brand"><img src="${BASE_AVATAR}" alt="Cloux"><div><h1>Cloux.</h1><small class="muted">Твій месенджер</small></div></div><p class="muted">${register?'Створи акаунт один раз — потім Cloux запамʼятає пристрій.':'Увійди в Cloux і продовжуй спілкування.'}</p>
 <form id="auth-form"><label>Номер телефону з кодом країни<input type="tel" name="phone" placeholder="+380…" autocomplete="tel" required></label>${register?'<label>Ім’я<input name="display" maxlength="60" required></label><label>Позивний (латиниця)<input name="username" minlength="4" maxlength="24" required></label>':''}<label>Пароль<input type="password" name="password" minlength="8" autocomplete="${register?'new-password':'current-password'}" required></label><button class="primary" type="submit">${register?'Зареєструватися':'Увійти'}</button></form>
 <div class="auth-footer"><button id="auth-switch">${register?'У мене вже є акаунт':'Створити акаунт'}</button><a href="/download">Завантажити Cloux ↗</a></div>
 <div class="notice">Увага: наразі номер не підтверджується SMS, а безплатний сервер не гарантує збереження акаунтів після перезапуску. Не використовуй конфіденційні дані.</div></section></main>`;
 $('#auth-switch').onclick=()=>loginUI(!register);
 $('#auth-form').onsubmit=withError(async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));await post(register?'/api/register':'/api/login',fd);await boot()});
}
async function boot(){clearInterval(timer);clearInterval(heartbeat);
 try{S.me=await api('/api/me')}catch{S.me=null;await loginUI();return}
 try{S.prefs=(await api('/api/preferences')).preferences}catch{S.prefs={}}
 S.local=loadLocal();if(S.prefs.photo_version>0&&S.local.avatar!=='default'){profileAvatar='/api/profile/'+encodeURIComponent(S.me.id)+'/media/avatar?v='+S.prefs.photo_version;profileBanner='/api/profile/'+encodeURIComponent(S.me.id)+'/media/banner?v='+S.prefs.photo_version;}
 // A local photo cache survives app restarts, even when the Render filesystem does not.
 for(const kind of ['avatar','banner','wallpaper']){
  const photo=await cachedPhoto(`${S.me.id}-${kind}`);
  if(photo){const u=URL.createObjectURL(photo);if(kind==='avatar'&&S.local.avatar!=='default')profileAvatar=u;else if(kind==='banner')profileBanner=u;else if(kind==='wallpaper')S.local.customWallpaperUrl=u;}
 }
 if((S.local.wallpaper||S.prefs.wallpaper)==='custom'&&!S.local.customWallpaperUrl){
  try{const res=await fetch('/api/profile/'+encodeURIComponent(S.me.id)+'/media/wallpaper',{credentials:'same-origin'});
   if(res.ok){const file=await res.blob();await cachePhoto(S.me.id+'-wallpaper',file);S.local.customWallpaperUrl=URL.createObjectURL(file)}
  }catch(e){console.warn('Wallpaper sync unavailable',e)}
 }
 syncTheme();
 $('#app').innerHTML='<div class="shell"><aside class="sidebar" id="sidebar"></aside><main class="content" id="main"></main></div>';
 await refreshChats();renderSidebar();renderWelcome();
 if(location.search.includes('join=')){const code=new URLSearchParams(location.search).get('join');if(code){try{const data=await api('/api/invites/'+encodeURIComponent(code));if(confirm('Приєднатися до '+data.chat.title+'?')){const joined=await post('/api/invites/'+encodeURIComponent(code)+'/join');await refreshChats();await openChat(joined.chat_id)}}catch(e){toast(e.message)}history.replaceState(null,'',location.pathname)}}
 timer=setInterval(async()=>{if(!document.hidden){await refreshChats();if(S.current)await updateMessages()}},4000);
 heartbeat=setInterval(()=>{if(!document.hidden)post('/api/presence/ping').catch(()=>{})},30000);
 post('/api/presence/ping').catch(()=>{});
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
boot();
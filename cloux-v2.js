/* Cloux 2.0 -- original monochrome liquid-glass UI, persistent preferences and WebRTC. */
(function(){
'use strict';
const css=`
:root{--red:#f3f3f5;--bg:#09090b;--panel:#131316;--hover:#25252b;--line:#303038}
body{background:#09090b;color:#f7f7f9}
.auth-wrap{background:radial-gradient(circle at 50% 14%,#414149 0%,transparent 42%),#08080a}
.logo{background:linear-gradient(145deg,#38383e,#101012);border:1px solid #5c5c67;box-shadow:0 10px 40px #0007}
.logo.cloux-logo{padding:0;overflow:hidden}
.logo.cloux-logo img{width:100%;height:100%;object-fit:contain}
.brand span{color:#eee}.primary{background:#f1f1f4!important;color:#0b0b0d!important}
.primary:hover{background:#d2d2d9!important}.link,.cloux-title{color:#dedee3}
.notice{background:#28282d;border-color:#515158;color:#e2e2e5}
.round,.cloux-tool,.cloux-chip{background:#303037;color:#f8f8f8}
.item:hover,.item.selected{background:#28282d}
.bubble.mine{background:#45454e;border-color:#777780;color:#fff}
.avatar{background:linear-gradient(140deg,#51515b,#18181f)}
.cloux-bigavatar{background:linear-gradient(145deg,#55555f,#1c1c23);box-shadow:0 0 25px #fff2}
.cloux-section{background:#24242c;border-color:#373740}.cloux-chip.selected{outline-color:#fff}
#cloux-nav{position:fixed;bottom:calc(12px + env(safe-area-inset-bottom));left:11px;width:333px;z-index:45;border:1px solid #ffffff55;border-radius:27px;background:linear-gradient(125deg,#ffffff30,#9696a71e 55%,#ffffff14);-webkit-backdrop-filter:blur(25px) saturate(1.5);backdrop-filter:blur(25px) saturate(1.5);box-shadow:0 12px 35px #000a,inset 0 1px #ffffff4d;padding:6px;gap:1px}
#cloux-nav button{font-size:10px;color:#cccbd3;padding:6px 2px;border-radius:19px}
#cloux-nav button span{font-size:23px}#cloux-nav button.active{background:#ffffff30;color:#fff}
.sidebar{background:#131317}.sidebar .list{padding-bottom:116px}.sidebar-foot{margin-bottom:88px}
.chat-top{background:#19191d}.main{background:radial-gradient(ellipse at 55% 0,#ffffff12,transparent 55%),#0b0b0f}
.cloux-v2-card{border:1px solid #ffffff38;background:#ffffff0d;padding:14px;border-radius:17px;margin-top:16px;line-height:1.6}
.cloux-advanced-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 0;border-bottom:1px solid #ffffff28}
.cloux-advanced-item input{accent-color:#ddd;width:22px;height:22px}
body.cloux-no-glass #cloux-nav{background:#26262c;backdrop-filter:none;-webkit-backdrop-filter:none}
body.cloux-no-motion *,body.cloux-no-motion *:before,body.cloux-no-motion *:after{animation-duration:.01ms!important;transition-duration:.01ms!important}
body.cloux-bubble-square .bubble{border-radius:8px!important}body.cloux-bubble-soft .bubble{border-radius:25px!important}
body.cloux-no-previews .item .preview{display:none}
.cloux-call-btn{height:40px;min-width:39px;background:#ffffff21;border:1px solid #ffffff38;color:#fff;border-radius:13px;font-size:18px}
.cloux-call-layer{position:fixed;inset:0;background:#070709ee;z-index:999;display:grid;place-items:center;padding:16px}
.cloux-call-box{width:min(500px,100%);border:1px solid #ffffff40;border-radius:28px;padding:25px;background:linear-gradient(140deg,#37373e,#0b0b0f);box-shadow:0 22px 80px #000;text-align:center}
.cloux-call-box h2{font-size:27px;margin:8px 0}.cloux-call-box p{color:#b9b9c2;line-height:1.55;font-size:13px}
.cloux-call-media{height:min(43vh,330px);position:relative;margin:18px 0;border-radius:18px;overflow:hidden;background:#17171e}
.cloux-call-media .remote{width:100%;height:100%;object-fit:cover}.cloux-call-media .local{position:absolute;bottom:10px;right:10px;width:29%;height:33%;object-fit:cover;border:2px solid #ffffff7a;border-radius:13px}
.cloux-call-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}.cloux-call-actions button{background:#50505b;border-radius:14px;padding:11px;min-width:76px}.cloux-call-actions .end{background:#bf3545}
@media(max-width:650px){#cloux-nav{width:calc(100% - 22px);left:11px;bottom:calc(9px + env(safe-area-inset-bottom))}.chat-top{height:auto;min-height:66px;padding:8px}.cloux-call-box{padding:17px}.cloux-call-media{height:36vh}}
`;
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
const oldBoot=boot,oldOpenChat=openChat,oldSettings=showSettings;
let activeCall=null,installPrompt=null,loadingPrefs=false;
const el=id=>document.getElementById(id);
function icons(){document.querySelectorAll('.logo').forEach(node=>{if(node.classList.contains('cloux-logo'))return;node.classList.add('cloux-logo');node.innerHTML='<img src="/cloux-icon.svg" alt="Cloux">';});}
function setDisplay(p){if(!p)return;document.body.classList.toggle('cloux-no-glass',!p.glass);document.body.classList.toggle('cloux-no-motion',!p.animations);document.body.classList.toggle('cloux-no-previews',!p.show_previews);document.body.classList.toggle('cloux-bubble-square',p.bubble_style==='square');document.body.classList.toggle('cloux-bubble-soft',p.bubble_style==='soft');}
async function loadDisplay(){if(!state.me||loadingPrefs)return;loadingPrefs=true;try{setDisplay((await api('/api/preferences')).preferences);}catch(e){console.warn('Settings',e);}finally{loadingPrefs=false;}}
async function saveDisplay(patch){try{const p=(await api('/api/preferences',{method:'PATCH',body:JSON.stringify(patch)})).preferences;setDisplay(p);return p;}catch(e){alert(e.message);return null;}}
async function openPersonalization(){let p;try{p=(await api('/api/preferences')).preferences;}catch(e){alert(e.message);return;}state.selected=null;el('app').classList.add('mobile-open');el('main').innerHTML='<header class="chat-top"><button type="button" id="v2-back" class="round">←</button><strong>Мій стиль Cloux</strong></header><section class="cloux-page"><div class="cloux-v2-card">Чорно-білий Cloux з персональними параметрами. Зміни зберігаються для твого акаунта.</div>'+[['glass','🫧 Скляна нижня панель'],['animations','✨ Плавні анімації'],['show_previews','💬 Попередній текст у чатах'],['compact','📱 Компактні чати'],['notify','🔔 Сповіщення']].map(([key,label])=>'<label class="cloux-advanced-item"><span>'+label+'</span><input type="checkbox" data-setting="'+key+'" '+(p[key]?'checked':'')+'></label>').join('')+'<div class="cloux-title">Форма повідомлень</div><div class="cloux-actions">'+[['rounded','Класична'],['square','Прямокутна'],['soft','М’яка']].map(([key,label])=>'<button type="button" class="cloux-chip '+(p.bubble_style===key?'selected':'')+'" data-shape="'+key+'">'+label+'</button>').join('')+'</div><div class="cloux-v2-card">Параметри тексту, фону й компактності також є у розділі «Оформлення».</div></section>';
el('v2-back').onclick=showSettings;document.querySelectorAll('[data-setting]').forEach(x=>x.onchange=async()=>saveDisplay({[x.dataset.setting]:x.checked}));document.querySelectorAll('[data-shape]').forEach(x=>x.onclick=async()=>{const result=await saveDisplay({bubble_style:x.dataset.shape});if(result)document.querySelectorAll('[data-shape]').forEach(b=>b.classList.toggle('selected',b.dataset.shape===result.bubble_style));});}
function installCloux(){if(installPrompt){installPrompt.prompt();installPrompt.userChoice.then(()=>{installPrompt=null;});return;}alert('Android: у Chrome відкрий меню ⋮ → «Встановити застосунок» або «Додати на головний екран». iPhone: Safari → Поділитися → «На екран Початок».');}
showSettings=function(){oldSettings();const page=document.querySelector('.cloux-page');if(!page)return;const card=document.createElement('div');card.className='cloux-v2-card';card.innerHTML='<strong>Cloux 2.0 • Персоналізація</strong><p>Чорно-білий стиль і скляна панель як на iPhone.</p><div class="cloux-actions"><button class="primary" id="v2-customize" type="button">Налаштувати під себе</button><button class="cloux-chip" id="v2-install" type="button">Встановити Cloux</button></div>';page.prepend(card);el('v2-customize').onclick=openPersonalization;el('v2-install').onclick=installCloux;icons();};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(e=>console.warn(e)));
async function beginCall(cid,mode){if(activeCall){alert('Спочатку заверши попередній дзвінок.');return;}if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){alert('Цей браузер не підтримує дзвінки.');return;}
const chat=state.chats.find(c=>c.id===cid);if(!chat||chat.kind!=='direct')return;
const layer=document.createElement('div');layer.className='cloux-call-layer';layer.innerHTML='<div class="cloux-call-box"><div class="cloux-bigavatar" style="margin:0 auto">'+escapeHTML(chat.title[0]||'C')+'</div><h2>'+escapeHTML(chat.title)+'</h2><p id="v2-call-status">Отримуємо дозвіл на мікрофон…</p><div class="cloux-call-media"><video class="remote" id="v2-remote" autoplay playsinline></video><video class="local" id="v2-local" autoplay playsinline muted></video></div><div class="cloux-call-actions"><button id="v2-mic" type="button">🎙️ Мікрофон</button><button id="v2-camera" type="button">📷 Камера</button><button class="end" id="v2-end" type="button">📞 Завершити</button></div><p>Обидва користувачі повинні відкрити цей чат і натиснути дзвінок. У деяких мережах без TURN-сервера з’єднання може не встановитися.</p></div>';document.body.append(layer);
const call={cid,layer,ws:null,pc:null,stream:null,queued:[],closing:false};activeCall=call;
const status=t=>{if(el('v2-call-status'))el('v2-call-status').textContent=t;};
function hangup(send=true){if(call.closing)return;call.closing=true;if(send&&call.ws?.readyState===WebSocket.OPEN)call.ws.send(JSON.stringify({type:'hangup'}));call.ws?.close();call.pc?.close();call.stream?.getTracks().forEach(t=>t.stop());layer.remove();if(activeCall===call)activeCall=null;}
el('v2-end').onclick=()=>hangup();
try{call.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:mode==='video'?{facingMode:'user'}:false});el('v2-local').srcObject=call.stream;if(!call.stream.getVideoTracks().length)el('v2-local').style.display='none';
el('v2-mic').onclick=()=>{const t=call.stream.getAudioTracks()[0];if(!t)return;t.enabled=!t.enabled;el('v2-mic').textContent=t.enabled?'🎙️ Мікрофон':'🔇 Без звуку';};
el('v2-camera').onclick=()=>{const t=call.stream.getVideoTracks()[0];if(!t){alert('Для відео почни відеодзвінок.');return;}t.enabled=!t.enabled;el('v2-camera').textContent=t.enabled?'📷 Камера':'🚫 Камера';};
call.pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]});call.stream.getTracks().forEach(t=>call.pc.addTrack(t,call.stream));
call.pc.ontrack=e=>{const v=el('v2-remote');if(v){v.srcObject=e.streams[0];v.play().catch(()=>{});}};
call.pc.onicecandidate=e=>{if(e.candidate&&call.ws?.readyState===WebSocket.OPEN)call.ws.send(JSON.stringify({type:'ice',candidate:e.candidate.toJSON()}));};
call.pc.onconnectionstatechange=()=>{if(call.closing)return;const s=call.pc.connectionState;if(s==='connected')status('Зв’язок установлено ✅');else if(s==='failed')status('Не вдалося з’єднатися. Може знадобитися TURN-сервер.');else if(s==='disconnected')status('З’єднання перервано.');};
call.ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/calls/'+encodeURIComponent(cid));
call.ws.onopen=()=>status('Очікуємо друга. Нехай він відкриє цей чат і натисне 📞.');call.ws.onclose=()=>{if(!call.closing)status('Дзвінок завершився або сервер відключився.');};call.ws.onerror=()=>status('Помилка сигналізації.');
async function queued(){while(call.queued.length&&call.pc.remoteDescription)try{await call.pc.addIceCandidate(call.queued.shift());}catch(e){console.warn(e);}}
call.ws.onmessage=async e=>{if(call.closing)return;try{const m=JSON.parse(e.data);if(m.type==='peer-joined'&&call.pc.signalingState==='stable'){status('З’єднання зі співрозмовником…');const offer=await call.pc.createOffer();await call.pc.setLocalDescription(offer);call.ws.send(JSON.stringify({type:'offer',sdp:call.pc.localDescription.toJSON()}));}else if(m.type==='offer'){await call.pc.setRemoteDescription(m.sdp);await queued();const answer=await call.pc.createAnswer();await call.pc.setLocalDescription(answer);call.ws.send(JSON.stringify({type:'answer',sdp:call.pc.localDescription.toJSON()}));}else if(m.type==='answer'){await call.pc.setRemoteDescription(m.sdp);await queued();}else if(m.type==='ice'){if(call.pc.remoteDescription)await call.pc.addIceCandidate(m.candidate).catch(console.warn);else call.queued.push(m.candidate);}else if(m.type==='peer-left'||m.type==='hangup')status('Співрозмовник завершив дзвінок.');}catch(err){console.warn('Call signal',err);status('Помилка узгодження дзвінка.');}};
}catch(e){status(e.name==='NotAllowedError'?'Дозволь мікрофон та камеру в браузері.':'Помилка дзвінка: '+e.message);el('v2-mic').disabled=true;el('v2-camera').disabled=true;}
}
openChat=async function(cid){if(activeCall&&activeCall.cid!==cid){alert('Заверши дзвінок перед зміною чату.');return;}await oldOpenChat(cid);const c=state.chats.find(x=>x.id===cid);if(c?.kind==='direct'){const h=document.querySelector('#main .chat-top');if(h){const tools=document.createElement('div');tools.className='tools';tools.innerHTML='<button class="cloux-call-btn" type="button" title="Голосовий дзвінок">📞</button><button class="cloux-call-btn" type="button" title="Відеодзвінок">📹</button>';h.append(tools);tools.children[0].onclick=()=>beginCall(cid,'audio');tools.children[1].onclick=()=>beginCall(cid,'video');}}icons();};
boot=async function(){await oldBoot();if(state.me){icons();await loadDisplay();}};
let counter=0;const timer=setInterval(()=>{if(state.me){icons();loadDisplay();clearInterval(timer);}else if(++counter>100)clearInterval(timer);},500);
window.addEventListener('beforeunload',()=>{activeCall?.stream?.getTracks().forEach(t=>t.stop());activeCall?.ws?.close();activeCall?.pc?.close();});
icons();
})();
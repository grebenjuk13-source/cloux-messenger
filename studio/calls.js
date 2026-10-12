/* CLOUX Studio WebRTC peer demo: real P2P camera/audio, no simulated remote users. */
(() => {
'use strict';
let current=null;
const $=id=>document.getElementById(id);
const servers=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
const safeJson=x=>{try{return JSON.parse(x)}catch{return null}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function iceComplete(pc,ms=9000){
 if(pc.iceGatheringState==='complete')return;
 await Promise.race([new Promise(resolve=>{const done=()=>{if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',done);resolve()}};pc.addEventListener('icegatheringstatechange',done)}),sleep(ms)]);
}
function setStatus(text){const el=$('studio-call-status');if(el)el.textContent=text}
function setTimer(){if(!current||!current.connectedAt)return;const seconds=Math.floor((Date.now()-current.connectedAt)/1000);const el=$('studio-call-timer');if(el)el.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}
function signal(data){
 if(!current)return;try{current.channel?.postMessage({room:current.room,from:current.id,to:data.to||null,...data})}catch{}
}
function manualPayload(type,sdp){
 if(!current)return;
 const text=JSON.stringify({cloux:'6.1.0',room:current.room,type,sdp},null,2);
 const textarea=$('studio-call-out');if(textarea)textarea.value=text;
}
async function setupPeer(){
 const state=current;if(!state)return;
 const pc=new RTCPeerConnection({iceServers:servers});state.pc=pc;
 state.stream.getTracks().forEach(t=>pc.addTrack(t,state.stream));
 pc.ontrack=e=>{
  const remote=$('studio-call-remote');if(remote){remote.srcObject=e.streams[0]||new MediaStream([e.track]);void remote.play().catch(()=>{})}
 };
 pc.onicecandidate=e=>{if(e.candidate)signal({type:'candidate',candidate:e.candidate.toJSON()})};
 pc.onconnectionstatechange=()=>{
  if(current!==state)return;
  if(pc.connectionState==='connecting')setStatus('Connecting · з’єднуємо напряму…');
  if(pc.connectionState==='connected'){if(!state.connectedAt)state.connectedAt=Date.now();setStatus('Active · з’єднання WebRTC встановлено');setTimer()}
  if(pc.connectionState==='disconnected')setStatus('Disconnected · зв’язок перервано');
  if(pc.connectionState==='failed')setStatus('Failed · з’єднання не встановлено. Можливо, потрібен TURN.');
 };
}
async function makeOffer(){
 const state=current;if(!state?.pc||state.negotiating)return;
 if(state.pc.signalingState!=='stable')return;
 state.negotiating=true;
 try{
  const offer=await state.pc.createOffer();await state.pc.setLocalDescription(offer);
  await iceComplete(state.pc);
  manualPayload('offer',state.pc.localDescription?.toJSON());
  signal({type:'offer',sdp:state.pc.localDescription?.toJSON()});
  setStatus('Ringing · очікуємо відповідь співрозмовника');
 }catch(e){setStatus('Не вдалося створити offer: '+(e?.message||e))}
 finally{state.negotiating=false}
}
async function acceptOffer(sdp){
 const state=current;if(!state?.pc)return;
 try{
  if(state.pc.signalingState!=='stable'){if(state.pc.signalingState==='have-local-offer')await state.pc.setLocalDescription({type:'rollback'});else return}
  await state.pc.setRemoteDescription(sdp);
  const answer=await state.pc.createAnswer();await state.pc.setLocalDescription(answer);
  await iceComplete(state.pc);
  manualPayload('answer',state.pc.localDescription?.toJSON());
  signal({type:'answer',sdp:state.pc.localDescription?.toJSON()});
  setStatus('Connecting · відповідь надіслана');
 }catch(e){setStatus('Помилка SDP offer: '+(e?.message||e))}
}
async function acceptAnswer(sdp){
 const state=current;if(!state?.pc)return;
 try{if(state.pc.signalingState==='have-local-offer')await state.pc.setRemoteDescription(sdp)}
 catch(e){setStatus('Помилка SDP answer: '+(e?.message||e))}
}
async function broadcastMessage(data){
 const state=current;
 if(!state||!data||data.room!==state.room||data.from===state.id||(data.to&&data.to!==state.id))return;
 try{
  if(data.type==='hello'){
   signal({type:'helloAck',to:data.from});
   if(state.id<data.from)await makeOffer();
  }
  if(data.type==='helloAck'&&state.id<data.from)await makeOffer();
  if(data.type==='offer'&&data.sdp)await acceptOffer(data.sdp);
  if(data.type==='answer'&&data.sdp)await acceptAnswer(data.sdp);
  if(data.type==='candidate'&&data.candidate&&state.pc?.remoteDescription)await state.pc.addIceCandidate(data.candidate).catch(()=>{});
  if(data.type==='hangup')setStatus('Співрозмовник завершив з’єднання');
 }catch(e){setStatus('Помилка сигналізації: '+(e?.message||e))}
}
async function start({target,room,title,mode='audio',toast=()=>{}}){
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){
  toast('Для WebRTC потрібен HTTPS або localhost і підтримка браузера');return false
 }
 if(current)end();
 const state={target,room,id:Math.random().toString(36).slice(2),pc:null,stream:null,screen:null,channel:null,negotiating:false,connectedAt:0,clock:null,muted:false,cameraOff:mode!=='video',mode};
 current=state;
 try{state.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:mode==='video'?{facingMode:'user'}:false})}
 catch(e){if(mode==='video'){try{state.stream=await navigator.mediaDevices.getUserMedia({audio:true});state.cameraOff=true;toast('Камера недоступна — продовжуємо з аудіо')}catch{current=null;toast('Потрібен доступ до мікрофона');return false}}
 else{current=null;toast('Потрібен доступ до мікрофона');return false}}
 target.hidden=false;
 target.innerHTML='<div class="call-card"><button id="studio-call-close" style="float:right;font-size:25px" aria-label="Завершити дзвінок">×</button>'+
 '<img class="call-avatar" src="/assets/cloux-default-avatar.jpg" alt="Cloux"><h2>'+String(title).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</h2>'+
 '<p class="status" id="studio-call-status">Calling · запускаємо пристрої…</p><div id="studio-call-timer" style="font-size:20px;font-variant-numeric:tabular-nums">00:00</div>'+
 '<p class="fingerprint" aria-label="Демонстраційні символи безпеки">❤️ 🔴 🔥 ✨</p>'+
 '<div class="call-videos"><video id="studio-call-local" muted autoplay playsinline></video><video id="studio-call-remote" autoplay playsinline></video></div>'+
 '<p style="color:var(--text-dim);font-size:12px">Реальний WebRTC. Символи вище декоративні, це не перевірка шифрування.</p>'+
 '<div class="call-controls"><button id="studio-call-mic">🎤 Мікрофон</button><button id="studio-call-camera">▣ Камера</button><button id="studio-call-share">▤ Екран</button><button class="primary" id="studio-call-offer">Створити offer</button><button class="danger" id="studio-call-hangup">☎ Завершити</button></div>'+
 '<div class="call-room"><b>Кімната: '+String(room).replace(/[&<>"]/g,'')+'</b><p>Відкрий це демо у другій вкладці й запусти дзвінок з того ж чату — вони спробують підключитися автоматично через BroadcastChannel.</p>'+
 '<p>Для іншого пристрою передай offer/answer довіреному співрозмовнику поза Cloux (наприклад, приватним повідомленням). SDP може містити мережеві адреси.</p>'+
 '<label>Надіслати співрозмовнику<textarea id="studio-call-out" readonly placeholder="SDP offer/answer з’явиться тут"></textarea></label><div class="call-controls"><button id="studio-call-copy">Копіювати SDP</button></div>'+
 '<label>Вставити SDP співрозмовника<textarea id="studio-call-in" placeholder="Встав JSON offer або answer"></textarea></label><button class="primary" id="studio-call-accept">Прийняти offer / answer</button></div></div>';
 const local=$('studio-call-local');if(local){local.srcObject=state.stream;void local.play().catch(()=>{})}
 await setupPeer();
 state.channel=new BroadcastChannel('cloux-studio-call-'+room);
 state.channel.onmessage=e=>{void broadcastMessage(e.data)};
 signal({type:'hello'});
 state.clock=setInterval(setTimer,1000);
 const listen=(id,fn)=>{const button=$(id);if(button)button.onclick=fn};
 listen('studio-call-close',end);listen('studio-call-hangup',end);
 listen('studio-call-offer',()=>void makeOffer());
 listen('studio-call-copy',async()=>{try{await navigator.clipboard.writeText($('studio-call-out').value);toast('SDP скопійовано')}catch{const t=$('studio-call-out');t?.select();toast('Скопіюй виділений текст вручну')}});
 listen('studio-call-accept',async()=>{
  const obj=safeJson($('studio-call-in').value);if(!obj||obj.cloux!=='6.1.0'||!['offer','answer'].includes(obj.type)||!obj.sdp||!['offer','answer'].includes(obj.sdp.type)){toast('Встав коректний Cloux SDP JSON');return}
  if(obj.room!==state.room){toast('SDP від іншого чату');return}
  if(obj.type==='offer')await acceptOffer(obj.sdp);else await acceptAnswer(obj.sdp);
 });
 listen('studio-call-mic',()=>{
  const tracks=state.stream?.getAudioTracks()||[];tracks.forEach(t=>t.enabled=!t.enabled);
  state.muted=!state.muted;$('studio-call-mic').textContent=state.muted?'🔇 Мікрофон вимкнено':'🎤 Мікрофон';
 });
 listen('studio-call-camera',async()=>{
  const track=state.stream?.getVideoTracks()[0];
  if(track){track.enabled=!track.enabled;state.cameraOff=!track.enabled}
  else{try{const video=await navigator.mediaDevices.getUserMedia({video:true});const v=video.getVideoTracks()[0];state.stream.addTrack(v);const sender=state.pc?.getSenders().find(x=>x.track?.kind==='video');if(sender)await sender.replaceTrack(v);else{state.pc?.addTrack(v,state.stream);void makeOffer()}const el=$('studio-call-local');if(el)el.srcObject=state.stream;state.cameraOff=false}catch{toast('Камера недоступна')}}
  $('studio-call-camera').textContent=state.cameraOff?'▣ Увімкнути камеру':'▣ Вимкнути камеру';
 });
 listen('studio-call-share',async()=>{
  if(state.screen){state.screen.getTracks().forEach(t=>t.stop());state.screen=null;const cam=state.stream?.getVideoTracks()[0],sender=state.pc?.getSenders().find(s=>s.track?.kind==='video');if(sender&&cam)await sender.replaceTrack(cam);$('studio-call-share').textContent='▤ Екран';return}
  if(!navigator.mediaDevices.getDisplayMedia){toast('Браузер не підтримує захоплення екрана');return}
  try{
   const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});state.screen=stream;
   const sender=state.pc?.getSenders().find(s=>s.track?.kind==='video');
   if(sender)await sender.replaceTrack(stream.getVideoTracks()[0]);
   else{state.pc?.addTrack(stream.getVideoTracks()[0],stream);void makeOffer()}
   stream.getVideoTracks()[0].onended=()=>{$('studio-call-share')?.click()};
   $('studio-call-share').textContent='■ Зупинити показ';toast('Показуєш екран');
  }catch{toast('Демонстрацію екрана не розпочато')}
 });
 return true;
}
function end(){
 if(!current)return;
 const s=current;current=null;
 try{s.channel?.postMessage({room:s.room,from:s.id,type:'hangup'})}catch{}
 s.channel?.close();if(s.clock)clearInterval(s.clock);
 s.pc?.close();s.stream?.getTracks().forEach(t=>t.stop());s.screen?.getTracks().forEach(t=>t.stop());
 if(s.target)s.target.hidden=true;
}
window.ClouxStudioCalls={start,end,active:()=>!!current};
})();
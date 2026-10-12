/* Cloux authenticated direct calls. Signaling lives at /ws/calls/{chatId}.
 * Browser WebRTC transports actual peer audio/video, not simulated calls.
 * Connection through NAT may require the TURN_* variables on the server.
 */
(() => {
'use strict';
let state=null;
const $=id=>document.getElementById(id);
const indicator=value=>{if($('live-call-status'))$('live-call-status').textContent=value};
function end(){
 const s=state;if(!s)return;
 state=null;
 try{if(s.ws?.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify({type:'hangup'}))}catch{}
 try{s.ws?.close()}catch{}
 s.pc?.close();s.local?.getTracks().forEach(t=>t.stop());s.display?.getTracks().forEach(t=>t.stop());
 if(s.timer)clearInterval(s.timer);
 if(s.raf)cancelAnimationFrame(s.raf);
 if(s.audio)void s.audio.close().catch(()=>{});
 if(s.target)s.target.hidden=true;
}
async function start({room,title,mode='audio',target,onStatus=()=>{}}){
 if(state)end();
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
  onStatus('Дзвінки потребують HTTPS і дозволу на мікрофон');return false
 }
 const s={room,title,mode,target,ws:null,pc:null,local:null,display:null,remote:null,timer:null,raf:0,audio:null,elapsed:0,started:0,connected:false,muted:false,camOff:mode!=='video',queued:[],pending:false};
 state=s;
 try{s.local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:mode==='video'?{facingMode:'user'}:false})}
 catch(e){state=null;onStatus(e?.name==='NotAllowedError'?'Дозволь браузеру використовувати мікрофон і камеру':'Не вдалося отримати доступ до мікрофона');return false}
 target.hidden=false;
 const titleEsc=String(title).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 target.innerHTML='<div class="call-card"><button id="live-call-close" aria-label="Завершити дзвінок" style="float:right;font-size:24px">×</button>'+
 '<img class="call-avatar" src="/assets/cloux-default-avatar.jpg" alt="Cloux"><h2>'+titleEsc+'</h2>'+
 '<p class="status" id="live-call-status">Calling · встановлюємо з’єднання…</p>'+
 '<div id="live-call-timer" style="font-variant-numeric:tabular-nums;font-size:19px">00:00</div>'+
 '<div class="fingerprint" aria-label="Декоративні символи">❤️ 🔥 ✨ 🫶</div>'+
 '<div class="call-videos"><video id="live-local" autoplay playsinline muted></video><video id="live-remote" autoplay playsinline></video></div>'+
 '<div class="call-controls"><button id="live-mute">🎤 Мікрофон</button><button id="live-camera">▣ Камера</button><button id="live-screen">▤ Екран</button><button class="danger" id="live-hangup">☎ Завершити</button></div>'+
 '<p style="color:var(--text-dim);font-size:12px">Справжній WebRTC-дзвінок. Чекай, доки співрозмовник відкриє цей чат і прийме дзвінок. Можливість з’єднання залежить від мережі й TURN-сервера. Емодзі — декоративні, не перевірка шифрування.</p></div>';
 const local=$('live-local'),remote=$('live-remote');
 local.srcObject=s.local;void local.play().catch(()=>{});
 s.remote=remote;
 let iceServers=[{urls:'stun:stun.l.google.com:19302'}];
 try{const response=await fetch('/api/v6/ice',{credentials:'same-origin',cache:'no-store'});if(response.ok){const json=await response.json();if(Array.isArray(json.iceServers))iceServers=json.iceServers}}catch{}
 if(state!==s)return false;
 const pc=new RTCPeerConnection({iceServers});s.pc=pc;
 s.local.getTracks().forEach(t=>pc.addTrack(t,s.local));
 pc.ontrack=e=>{
  if(!e.track||state!==s)return;
  if(e.streams[0])remote.srcObject=e.streams[0];
  else remote.srcObject=new MediaStream([e.track]);
  void remote.play().catch(()=>{});
  if(e.track.kind==='audio'&&e.streams[0])attachLevel(s,e.streams[0]);
 };
 pc.onicecandidate=e=>{if(e.candidate&&s.ws?.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify({type:'ice',candidate:e.candidate.toJSON()}))};
 pc.onconnectionstatechange=()=>{
  if(state!==s)return;
  if(pc.connectionState==='connecting')indicator('Connecting · з’єднуємо медіа…');
  if(pc.connectionState==='connected'){
   s.connected=true;s.started=Date.now();indicator('Active · на зв’язку');
   if(!s.timer)s.timer=setInterval(()=>{
    if(state!==s)return;const n=Math.floor((Date.now()-s.started)/1000);
    $('live-call-timer').textContent=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
   },1000);
  }
  if(pc.connectionState==='disconnected')indicator('Зв’язок перервано');
  if(pc.connectionState==='failed')indicator('З’єднання не вдалося. Перевір мережу або TURN.');
 };
 const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/calls/'+encodeURIComponent(room));
 s.ws=ws;
 ws.onopen=()=>indicator('Ringing · очікуємо співрозмовника…');
 ws.onclose=()=>{if(state===s&&!s.connected)indicator('Зв’язок із сервером дзвінків перервано')};
 ws.onerror=()=>indicator('Помилка сигналізації дзвінка');
 async function addQueued(){while(s.queued.length&&pc.remoteDescription){const c=s.queued.shift();try{await pc.addIceCandidate(c)}catch{}}}
 ws.onmessage=async e=>{
  if(state!==s)return;
  let data;try{data=JSON.parse(e.data)}catch{return}
  try{
   if(data.type==='ready'&&data.peers>0)indicator('Connecting · співрозмовник підключається…');
   if(data.type==='peer-joined'&&pc.signalingState==='stable'){
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({type:'offer',sdp:pc.localDescription.toJSON()}));
    indicator('Connecting · узгоджуємо дзвінок…');
   }
   if(data.type==='offer'){
    await pc.setRemoteDescription(data.sdp);await addQueued();
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({type:'answer',sdp:pc.localDescription.toJSON()}));
    indicator('Connecting · узгоджуємо дзвінок…');
   }
   if(data.type==='answer'&&pc.signalingState==='have-local-offer'){await pc.setRemoteDescription(data.sdp);await addQueued()}
   if(data.type==='ice'){
    if(pc.remoteDescription)await pc.addIceCandidate(data.candidate).catch(()=>{});
    else s.queued.push(data.candidate);
   }
   if(data.type==='peer-left'||data.type==='hangup')indicator('Співрозмовник завершив дзвінок');
  }catch(err){indicator('Помилка WebRTC: '+(err?.message||err))}
 };
 $('live-call-close').onclick=end;$('live-hangup').onclick=end;
 $('live-mute').onclick=()=>{
  const track=s.local.getAudioTracks()[0];if(!track)return;track.enabled=!track.enabled;s.muted=!track.enabled;
  $('live-mute').textContent=track.enabled?'🎤 Мікрофон':'🔇 Вимкнено';
 };
 $('live-camera').onclick=async()=>{
  let track=s.local.getVideoTracks()[0];
  if(track){track.enabled=!track.enabled;s.camOff=!track.enabled}
  else try{
   const video=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}});
   track=video.getVideoTracks()[0];s.local.addTrack(track);local.srcObject=s.local;
   const sender=pc.getSenders().find(x=>x.track?.kind==='video');
   if(sender)await sender.replaceTrack(track);
   else{pc.addTrack(track,s.local);await renegotiate(s)}
   s.camOff=false;
  }catch{onStatus('Не вдалося ввімкнути камеру')}
  $('live-camera').textContent=s.camOff?'▣ Увімкнути':'▣ Вимкнути';
 };
 $('live-screen').onclick=async()=>{
  if(s.display){
   s.display.getTracks().forEach(t=>t.stop());s.display=null;
   const old=s.local.getVideoTracks()[0],sender=pc.getSenders().find(x=>x.track?.kind==='video');
   if(sender&&old)await sender.replaceTrack(old);
   else if(sender)await sender.replaceTrack(null);
   $('live-screen').textContent='▤ Екран';return;
  }
  if(!navigator.mediaDevices.getDisplayMedia){onStatus('Демонстрація екрана не підтримується браузером');return}
  try{
   const display=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
   const video=display.getVideoTracks()[0];s.display=display;
   const sender=pc.getSenders().find(x=>x.track?.kind==='video');
   if(sender)await sender.replaceTrack(video);
   else{pc.addTrack(video,display);await renegotiate(s)}
   $('live-screen').textContent='■ Припинити показ';
   video.addEventListener('ended',()=>{if(s.display)$('live-screen')?.click()},{once:true});
  }catch{onStatus('Демонстрацію екрана не розпочато')}
 };
 return true;
}
async function renegotiate(s){
 if(!s.ws||s.ws.readyState!==WebSocket.OPEN||s.pc.signalingState!=='stable')return;
 const offer=await s.pc.createOffer();await s.pc.setLocalDescription(offer);
 s.ws.send(JSON.stringify({type:'offer',sdp:s.pc.localDescription.toJSON()}));
}
function attachLevel(s,stream){
 try{
  const ac=new AudioContext();s.audio=ac;
  const analyser=ac.createAnalyser();analyser.fftSize=256;ac.createMediaStreamSource(stream).connect(analyser);
  const data=new Uint8Array(analyser.frequencyBinCount);
  const update=()=>{if(s!==state)return;analyser.getByteFrequencyData(data);const volume=data.reduce((a,b)=>a+b,0)/data.length;
   const pic=$('.call-avatar');if(pic)pic.style.filter='drop-shadow(0 0 '+Math.round(volume/4)+'px #ff1a1a)';
   s.raf=requestAnimationFrame(update);
  };update();
 }catch{}
}
window.ClouxStudioLiveCalls={start,end,active:()=>Boolean(state)};
})();
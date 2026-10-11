import {$,S,esc,toast,BASE_AVATAR} from './core.js';
/** Authenticated WebRTC P2P signaling. TURN deployment is still required for broad network compatibility. */
let active=null;
export async function startCall(chat,video=false){
 if(active){toast('Спочатку заверши попередній дзвінок');return}
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){toast('Браузер не підтримує дзвінки');return}
 const overlay=document.createElement('div');overlay.className='call-layer';overlay.innerHTML=`<div class="call-card"><img class="avatar lg" src="${BASE_AVATAR}" alt=""><h2>${esc(chat.title)}</h2><p id="call-status" class="muted">Підключення…</p><div class="call-videos"><video id="remote" autoplay playsinline></video><video id="local" class="local" autoplay muted playsinline></video></div><div class="call-controls"><button data-mute>🎙 Мікрофон</button><button data-camera>📹 Камера</button><button class="hang" data-end>📞 Завершити</button></div><p class="muted small">Співрозмовник має відкрити цей чат і натиснути дзвінок. Для деяких мобільних мереж потрібен TURN-сервер.</p></div>`;document.body.append(overlay);
 const ctx={ws:null,pc:null,stream:null,closed:false};active=ctx;
 const status=text=>{if($('#call-status'))$('#call-status').textContent=text};
 const close=()=>{if(ctx.closed)return;ctx.closed=true;try{if(ctx.ws?.readyState===1)ctx.ws.send(JSON.stringify({type:'hangup'}))}catch{}ctx.ws?.close();ctx.pc?.close();ctx.stream?.getTracks().forEach(t=>t.stop());overlay.remove();if(active===ctx)active=null};
 $('[data-end]',overlay).onclick=close;
 try{
  ctx.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true},video:video?{facingMode:'user'}:false});
  $('#local').srcObject=ctx.stream;
  ctx.pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  ctx.stream.getTracks().forEach(t=>ctx.pc.addTrack(t,ctx.stream));
  ctx.pc.ontrack=e=>{$('#remote').srcObject=e.streams[0]};
  ctx.pc.onicecandidate=e=>{if(e.candidate&&ctx.ws?.readyState===1)ctx.ws.send(JSON.stringify({type:'ice',candidate:e.candidate.toJSON()}))};
  ctx.pc.onconnectionstatechange=()=>status(({connected:'На звʼязку ✓',failed:'Зʼєднання не вдалося — можливо, потрібен TURN',disconnected:'Зʼєднання втрачено'})[ctx.pc.connectionState]||'З’єднання…');
  const queued=[];let offerSent=false;
  const flush=async()=>{while(queued.length)await ctx.pc.addIceCandidate(queued.shift()).catch(()=>{})};
  ctx.ws=new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws/calls/'+encodeURIComponent(chat.id));
  ctx.ws.onopen=()=>status('Чекаємо, поки друг приєднається…');
  ctx.ws.onclose=()=>{if(!ctx.closed)status('Сервер дзвінка відключився')};
  ctx.ws.onmessage=async e=>{if(ctx.closed)return;try{const m=JSON.parse(e.data);
   if(m.type==='peer-joined'&&ctx.pc.signalingState==='stable'){
    const offer=await ctx.pc.createOffer();await ctx.pc.setLocalDescription(offer);offerSent=true;ctx.ws.send(JSON.stringify({type:'offer',sdp:ctx.pc.localDescription.toJSON()}))
   }else if(m.type==='offer'&&!offerSent){await ctx.pc.setRemoteDescription(m.sdp);await flush();const ans=await ctx.pc.createAnswer();await ctx.pc.setLocalDescription(ans);ctx.ws.send(JSON.stringify({type:'answer',sdp:ctx.pc.localDescription.toJSON()}))}
   else if(m.type==='answer'){await ctx.pc.setRemoteDescription(m.sdp);await flush()}
   else if(m.type==='ice'){if(ctx.pc.remoteDescription)await ctx.pc.addIceCandidate(m.candidate).catch(()=>{});else queued.push(m.candidate)}
   else if(m.type==='hangup'||m.type==='peer-left')status('Співрозмовник вийшов із дзвінка');
  }catch(err){console.warn(err);status('Помилка з’єднання')}};
  $('[data-mute]',overlay).onclick=e=>{const t=ctx.stream.getAudioTracks()[0];t.enabled=!t.enabled;e.target.textContent=t.enabled?'🎙 Мікрофон':'🔇 Вимкнено'};
  $('[data-camera]',overlay).onclick=e=>{const t=ctx.stream.getVideoTracks()[0];if(!t){toast('Почни відеодзвінок, щоб увімкнути камеру');return}t.enabled=!t.enabled;e.target.textContent=t.enabled?'📹 Камера':'📷 Вимкнено'};
 }catch(err){status(err.name==='NotAllowedError'?'Дозволь доступ до мікрофона/камери':err.message)}
}
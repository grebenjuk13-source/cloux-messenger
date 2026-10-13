import {useEffect,useRef,useState} from 'react';
import {Mic,MicOff,Video,VideoOff,MonitorUp,PhoneOff,Volume2,Maximize2,Users,AlertCircle} from 'lucide-react';
import './CallOverlay.css';

type CallMode='audio'|'video';
type Props={chatId:string;title:string;mode:CallMode;onClose:()=>void};

export default function CallOverlay({chatId,title,mode,onClose}:Props){
 const [status,setStatus]=useState('Підключаємося…'),[talking,setTalking]=useState(false);
 const [muted,setMuted]=useState(false),[deafened,setDeafened]=useState(false),[seconds,setSeconds]=useState(0),[cameraOff,setCameraOff]=useState(mode!=='video');
 const [sharing,setSharing]=useState(false),[peerOnline,setPeerOnline]=useState(false);
 const [full,setFull]=useState(false),[signal,setSignal]=useState<number|null>(null),[reconnecting,setReconnecting]=useState(false);
 const localRef=useRef<HTMLVideoElement>(null),remoteRef=useRef<HTMLVideoElement>(null);
 const socketRef=useRef<WebSocket|null>(null),pcRef=useRef<RTCPeerConnection|null>(null);
 const streamRef=useRef<MediaStream|null>(null),shareRef=useRef<MediaStream|null>(null);
 const queued=useRef<RTCIceCandidateInit[]>([]);
 const stopping=useRef(false),startedAt=useRef(Date.now()),audioCtxRef=useRef<AudioContext|null>(null),rafRef=useRef(0);
 useEffect(()=>{const id=window.setInterval(()=>setSeconds(Math.floor((Date.now()-startedAt.current)/1000)),1000);return()=>clearInterval(id)},[]);
 useEffect(()=>{let live=true;const id=window.setInterval(async()=>{const pc=pcRef.current;if(!pc||pc.connectionState!=='connected')return;try{let RTT:number|undefined;const report=await pc.getStats();report.forEach(stat=>{if(stat.type==='candidate-pair'&&stat.state==='succeeded'&&typeof stat.currentRoundTripTime==='number')RTT=stat.currentRoundTripTime});if(live&&RTT!==undefined)setSignal(RTT<.12?4:RTT<.25?3:RTT<.5?2:1)}catch{}},4000);return()=>{live=false;window.clearInterval(id)}},[]);
 function finish(){window.dispatchEvent(new CustomEvent('cloux:call-log',{detail:{chatId,title,mode,at:Date.now(),duration:seconds,result:peerOnline?'Дзвінок завершено':'Без з’єднання'}}));onClose()}
 const clock=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');

 useEffect(()=>{
  stopping.current=false;
  let ws:WebSocket|null=null,pc:RTCPeerConnection|null=null,local:MediaStream|null=null;
  async function init(){
   if(!navigator.mediaDevices?.getUserMedia){setStatus('Цей пристрій не підтримує дзвінки через браузер');return}
   try{
    local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:mode==='video'?{facingMode:'user'}:false});
    if(stopping.current){local.getTracks().forEach(x=>x.stop());return}
    streamRef.current=local;if(localRef.current)localRef.current.srcObject=local;
    const ice = await fetch('/api/v6/ice',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).catch(()=>null);
    pc=new RTCPeerConnection({iceServers:Array.isArray(ice?.iceServers)?ice.iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    pcRef.current=pc;
    local.getTracks().forEach(track=>pc!.addTrack(track,local!));
    pc.ontrack=e=>{if(remoteRef.current){remoteRef.current.srcObject=e.streams[0];void remoteRef.current.play().catch(()=>{})}if(e.track.kind==='audio'&&e.streams[0]){try{const ctx=new AudioContext();audioCtxRef.current=ctx;const analyser=ctx.createAnalyser();analyser.fftSize=256;ctx.createMediaStreamSource(e.streams[0]).connect(analyser);const values=new Uint8Array(analyser.frequencyBinCount);const listen=()=>{analyser.getByteFrequencyData(values);let level=0;for(const n of values)level+=n;setTalking(level/values.length>18);rafRef.current=requestAnimationFrame(listen)};listen()}catch{}}};
    pc.onicecandidate=e=>{if(e.candidate&&ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ice',candidate:e.candidate.toJSON()}))};
    pc.onconnectionstatechange=()=>{
     if(stopping.current)return;
     if(pc!.connectionState==='connected'){setPeerOnline(true);setReconnecting(false);setStatus('На зв’язку')}
     if(pc!.connectionState==='failed'){setReconnecting(true);setStatus('Перепідключення…');try{pc!.restartIce();if(pc!.signalingState==='stable'&&ws?.readyState===WebSocket.OPEN){void pc!.createOffer({iceRestart:true}).then(async offer=>{await pc!.setLocalDescription(offer);ws!.send(JSON.stringify({type:'offer',sdp:pc!.localDescription?.toJSON()}))}).catch(()=>setStatus('Не вдалося відновити дзвінок'))}}catch{setStatus('Не вдалося відновити дзвінок')}}
     if(pc!.connectionState==='disconnected'){setPeerOnline(false);setReconnecting(true);setStatus('Перепідключення…')}
    };
    const proto=location.protocol==='https:'?'wss:':'ws:';
    ws=new WebSocket(proto+'//'+location.host+'/ws/calls/'+encodeURIComponent(chatId));
    socketRef.current=ws;
    ws.onopen=()=>setStatus('Очікуємо, поки співрозмовник прийме дзвінок…');
    ws.onerror=()=>setStatus('Не вдалося з’єднатися із сервером дзвінків');
    ws.onclose=()=>{if(!stopping.current)setStatus('З’єднання завершилося')};
    async function applyCandidates(){
     while(queued.current.length&&pc?.remoteDescription){
      const c=queued.current.shift();if(c)await pc.addIceCandidate(c).catch(()=>{});
     }
    }
    ws.onmessage=async e=>{
     if(stopping.current||!pc||!ws)return;
     try{
      const data=JSON.parse(e.data);
      if(data.type==='ready'){if(data.peers>0)setStatus('Підключення співрозмовника…')}
      if(data.type==='peer-joined'&&pc.signalingState==='stable'){
       setStatus('З’єднуємо дзвінок…');
       const offer=await pc.createOffer();await pc.setLocalDescription(offer);
       ws.send(JSON.stringify({type:'offer',sdp:pc.localDescription?.toJSON()}));
      }
      if(data.type==='offer'){
       await pc.setRemoteDescription(data.sdp);await applyCandidates();
       const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
       ws.send(JSON.stringify({type:'answer',sdp:pc.localDescription?.toJSON()}));
      }
      if(data.type==='answer'){await pc.setRemoteDescription(data.sdp);await applyCandidates()}
      if(data.type==='ice'){
       if(pc.remoteDescription)await pc.addIceCandidate(data.candidate).catch(()=>{});
       else queued.current.push(data.candidate);
      }
      if(data.type==='peer-left'||data.type==='hangup'){setPeerOnline(false);setStatus('Співрозмовник завершив дзвінок')}
     }catch(err){console.warn('Cloux call signaling',err);setStatus('Не вдалося узгодити дзвінок')}
    };
   }catch(err){
    if(local)local.getTracks().forEach(x=>x.stop());
    setStatus((err instanceof DOMException&&err.name==='NotAllowedError')?'Потрібен дозвіл на мікрофон і камеру':'Не вдалося запустити дзвінок');
   }
  }
  void init();
  return()=>{
   stopping.current=true;
   if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'hangup'}));
   ws?.close();pc?.close();
   streamRef.current?.getTracks().forEach(t=>t.stop());
   shareRef.current?.getTracks().forEach(t=>t.stop());
   cancelAnimationFrame(rafRef.current);void audioCtxRef.current?.close();
  };
 },[chatId,mode]);

 function toggleMic(){
  const track=streamRef.current?.getAudioTracks()[0];if(!track)return;
  track.enabled=!track.enabled;setMuted(!track.enabled);
 }
 async function toggleCamera(){
  const existing=streamRef.current?.getVideoTracks()[0];
  if(existing){existing.enabled=!existing.enabled;setCameraOff(!existing.enabled);return}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({video:true});
   const track=stream.getVideoTracks()[0];
   streamRef.current?.addTrack(track);
   const pc=pcRef.current;
   if(pc){pc.addTrack(track,streamRef.current!);if(pc.signalingState==='stable'&&socketRef.current?.readyState===WebSocket.OPEN){
    // Renegotiation for a camera added after an audio-only call.
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    socketRef.current.send(JSON.stringify({type:'offer',sdp:pc.localDescription?.toJSON()}));
   }}
   if(localRef.current)localRef.current.srcObject=streamRef.current;
   setCameraOff(false);
  }catch{setStatus('Дозволь доступ до камери')}
 }
 async function toggleScreen(){
  if(sharing){
   shareRef.current?.getTracks().forEach(t=>t.stop());
   shareRef.current=null;
   const cam=streamRef.current?.getVideoTracks()[0];
   const sender=pcRef.current?.getSenders().find(x=>x.track?.kind==='video');
   if(cam&&sender)await sender.replaceTrack(cam).catch(()=>{});
   setSharing(false);return;
  }
  if(!navigator.mediaDevices?.getDisplayMedia){setStatus('Демонстрація екрана недоступна на цьому пристрої');return}
  try{
   const capture=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
   const screen=capture.getVideoTracks()[0];
   const sender=pcRef.current?.getSenders().find(x=>x.track?.kind==='video');
   if(sender)await sender.replaceTrack(screen);
   else{pcRef.current?.addTrack(screen,capture);if(pcRef.current?.signalingState==='stable'){
    const offer=await pcRef.current.createOffer();await pcRef.current.setLocalDescription(offer);
    socketRef.current?.send(JSON.stringify({type:'offer',sdp:pcRef.current.localDescription?.toJSON()}));
   }}
   shareRef.current=capture;setSharing(true);screen.onended=()=>void toggleScreen();
  }catch{setStatus('Демонстрацію екрана не розпочато')}
 }
 return <div className="cloux-call-overlay" role="dialog" aria-modal="true" aria-label={'Дзвінок із '+title}>
  <div className="cloux-call-panel">
   <div className="cloux-call-heading"><div className="cloux-call-badge">CLOUX · CALL</div><button aria-label={full?"Згорнути дзвінок":"На весь екран"} onClick={()=>{if(document.fullscreenElement){void document.exitFullscreen().catch(()=>{});setFull(false)}else{void document.querySelector('.cloux-call-panel')?.requestFullscreen?.().then(()=>setFull(true)).catch(()=>{})}}}><Maximize2 size={18}/></button></div>
   <h2>{title}</h2><div className="cloux-call-clock">{clock}</div>{peerOnline&&<div className="cloux-signal" aria-label={signal===null?'Перевірка якості зв’язку':'Якість зв’язку '+signal+' з 4'}><span>Зв’язок</span>{[1,2,3,4].map(x=><i key={x} className={signal!==null&&signal>=x?'good':''} style={{height:6+x*4}}/>)}</div>}<p className="cloux-call-status"><span className={peerOnline?'connected':''}/>{status}</p>
   <div className={'cloux-call-stage '+(talking?'speaking ':'')+(reconnecting?'reconnecting':'')}><video ref={remoteRef} playsInline autoPlay muted={deafened} className="cloux-remote" />
    <div className="cloux-call-placeholder"><Users size={54}/><span>{peerOnline?'Учасник дзвінка':'Очікування співрозмовника'}</span></div>
    <video ref={localRef} playsInline autoPlay muted className="cloux-local"/>
   </div>
   <div className="cloux-call-controls">
    <button className={muted?'off':''} onClick={toggleMic} aria-label={muted?'Увімкнути мікрофон':'Вимкнути мікрофон'}>{muted?<MicOff/>:<Mic/>}<span>Мікрофон</span></button>
    <button className={deafened?'off':''} onClick={()=>setDeafened(v=>!v)} aria-label={deafened?'Увімкнути звук співрозмовника':'Вимкнути звук співрозмовника'}><Volume2/><span>{deafened?'Звук вимкнено':'Звук'}</span></button>
    <button className={cameraOff?'off':''} onClick={()=>void toggleCamera()} aria-label={cameraOff?'Увімкнути камеру':'Вимкнути камеру'}>{cameraOff?<VideoOff/>:<Video/>}<span>Камера</span></button>
    <button className={sharing?'sharing':''} onClick={()=>void toggleScreen()} aria-label={sharing?'Зупинити демонстрацію':'Демонстрація екрана'}><MonitorUp/><span>Екран</span></button>
    <button className="cloux-hangup" onClick={finish} aria-label="Завершити дзвінок"><PhoneOff/><span>Завершити</span></button>
   </div>
   <p className="cloux-call-note"><Volume2 size={15}/> Звук відтворюється через динамік або навушники пристрою. На деяких мережах може знадобитися TURN-сервер.</p>
  </div>
 </div>;
}

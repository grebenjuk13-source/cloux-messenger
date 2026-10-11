import {useEffect,useRef,useState} from 'react';
import {Mic,MicOff,Video,VideoOff,MonitorUp,PhoneOff,Volume2,Maximize2,Users,AlertCircle} from 'lucide-react';
import './CallOverlay.css';

type CallMode='audio'|'video';
type Props={chatId:string;title:string;mode:CallMode;onClose:()=>void};

export default function CallOverlay({chatId,title,mode,onClose}:Props){
 const [status,setStatus]=useState('Підключаємося…');
 const [muted,setMuted]=useState(false),[cameraOff,setCameraOff]=useState(mode!=='video');
 const [sharing,setSharing]=useState(false),[peerOnline,setPeerOnline]=useState(false);
 const [full,setFull]=useState(false);
 const localRef=useRef<HTMLVideoElement>(null),remoteRef=useRef<HTMLVideoElement>(null);
 const socketRef=useRef<WebSocket|null>(null),pcRef=useRef<RTCPeerConnection|null>(null);
 const streamRef=useRef<MediaStream|null>(null),shareRef=useRef<MediaStream|null>(null);
 const queued=useRef<RTCIceCandidateInit[]>([]);
 const stopping=useRef(false);

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
    pc.ontrack=e=>{if(remoteRef.current){remoteRef.current.srcObject=e.streams[0];void remoteRef.current.play().catch(()=>{})}};
    pc.onicecandidate=e=>{if(e.candidate&&ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ice',candidate:e.candidate.toJSON()}))};
    pc.onconnectionstatechange=()=>{
     if(stopping.current)return;
     if(pc!.connectionState==='connected'){setPeerOnline(true);setStatus('На зв’язку')}
     if(pc!.connectionState==='failed'){setStatus('З’єднання не вдалося. Можливо, у цій мережі потрібен TURN-сервер.')}
     if(pc!.connectionState==='disconnected'){setPeerOnline(false);setStatus('Зв’язок перервано')}
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
   shareRef.current?.getTracks().forEach(t=>t.stop());shareRef.current=null;
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
   <div className="cloux-call-heading"><div className="cloux-call-badge">CLOUX · CALL</div><button aria-label="На весь екран" onClick={()=>{setFull(!full);void document.querySelector('.cloux-call-panel')?.requestFullscreen?.().catch(()=>{})}}><Maximize2 size={18}/></button></div>
   <h2>{title}</h2><p className="cloux-call-status"><span className={peerOnline?'connected':''}/>{status}</p>
   <div className="cloux-call-stage"><video ref={remoteRef} playsInline autoPlay className="cloux-remote" />
    <div className="cloux-call-placeholder"><Users size={54}/><span>{peerOnline?'Учасник дзвінка':'Очікування співрозмовника'}</span></div>
    <video ref={localRef} playsInline autoPlay muted className="cloux-local"/>
   </div>
   <div className="cloux-call-controls">
    <button className={muted?'off':''} onClick={toggleMic} aria-label={muted?'Увімкнути мікрофон':'Вимкнути мікрофон'}>{muted?<MicOff/>:<Mic/>}<span>Мікрофон</span></button>
    <button className={cameraOff?'off':''} onClick={()=>void toggleCamera()} aria-label={cameraOff?'Увімкнути камеру':'Вимкнути камеру'}>{cameraOff?<VideoOff/>:<Video/>}<span>Камера</span></button>
    <button className={sharing?'sharing':''} onClick={()=>void toggleScreen()} aria-label={sharing?'Зупинити демонстрацію':'Демонстрація екрана'}><MonitorUp/><span>Екран</span></button>
    <button className="cloux-hangup" onClick={onClose} aria-label="Завершити дзвінок"><PhoneOff/><span>Завершити</span></button>
   </div>
   <p className="cloux-call-note"><Volume2 size={15}/> Звук відтворюється через динамік або навушники пристрою. На деяких мережах може знадобитися TURN-сервер.</p>
  </div>
 </div>;
}

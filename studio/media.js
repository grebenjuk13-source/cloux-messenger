/* CLOUX Studio Media — real browser camera, microphone and local recordings. */
(() => {
'use strict';
let current=null,recorder=null,chunks=[],ctx=null,analyser=null,frame=0,ticker=0,stopped=false,preview=null;
const $=id=>document.getElementById(id);
const supported=()=>window.isSecureContext&&!!navigator.mediaDevices?.getUserMedia;
const formats=(kind)=>kind==='video'?['video/webm;codecs=vp8,opus','video/webm','video/mp4']:['audio/webm;codecs=opus','audio/webm','audio/mp4'];
const stopTracks=()=>{current?.getTracks().forEach(t=>t.stop());current=null;cancelAnimationFrame(frame);clearInterval(ticker);if(ctx){void ctx.close().catch(()=>{});ctx=null}};
const cancel=()=>{stopped=true;if(recorder?.state==='recording')recorder.stop();stopTracks()};
function startRecorder(stream,kind,onFile,onState,limit=90){
 if(!window.MediaRecorder)throw Error('MediaRecorder недоступний');
 const mime=formats(kind).find(x=>MediaRecorder.isTypeSupported(x));
 chunks=[];stopped=false;recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
 recorder.onstop=()=>{
  const old=recorder;const output=[...chunks];const cancelled=stopped;
  stopped=true;stopTracks();
  if(!cancelled&&output.length){
   const type=old.mimeType||(kind==='video'?'video/webm':'audio/webm');
   const extension=type.includes('mp4')?'mp4':'webm';
   onFile(new File([new Blob(output,{type})],'cloux-'+kind+'-'+Date.now()+'.'+extension,{type}));
  }else if(!cancelled)onState('Запис завершено без даних');
  onState('Запис зупинено');recorder=null;
 };
 recorder.start(240);
 let n=0;
 ticker=window.setInterval(()=>{n++;onState('Запис · '+String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'));if(n>=limit&&recorder?.state==='recording')recorder.stop()},1000);
}
async function voice({onFile,onLevel,onState,onError}){
 if(!supported()){onError('Для мікрофона потрібен HTTPS або localhost');return false}
 if(recorder?.state==='recording'){finishVoice();return true}
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  current=stream;
  startRecorder(stream,'audio',onFile,onState,120);
  try{
   ctx=new AudioContext();analyser=ctx.createAnalyser();analyser.fftSize=256;
   ctx.createMediaStreamSource(stream).connect(analyser);
   const frequencies=new Uint8Array(analyser.frequencyBinCount);
   const animate=()=>{if(recorder?.state!=='recording'||!analyser)return;analyser.getByteFrequencyData(frequencies);const volume=frequencies.reduce((a,b)=>a+b,0)/frequencies.length;onLevel(volume/256);frame=requestAnimationFrame(animate)};
   animate();
  }catch{onLevel(0)}
  return true;
 }catch(e){onError(e?.name==='NotAllowedError'?'Дозволь браузеру використовувати мікрофон':'Помилка мікрофона: '+(e?.message||e));return false}
}
function finishVoice(){if(recorder?.state==='recording')recorder.stop()}
function cancelVoice(){cancel()}
async function camera({target,onFile,onState,onError}){
 if(!supported()){onError('Камера працює через HTTPS або localhost');return}
 let facing='user';let stream=null;let video=null;
 target.hidden=false;
 const setup=async()=>{
  stream?.getTracks().forEach(t=>t.stop());
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280}},audio:false});
  current=stream;
  video=$('cloux-camera-video');if(video){video.srcObject=stream;await video.play().catch(()=>{})}
 };
 target.innerHTML='<div class="media-card"><button id="cloux-camera-close" style="float:right;font-size:24px" aria-label="Закрити">×</button><h2>Камера Cloux</h2><video id="cloux-camera-video" playsinline autoplay muted></video><p style="color:var(--text-dim);font-size:12px">Фото та відеокружки залишаються лише у локальному демочаті.</p><div class="media-controls"><button id="cloux-camera-flip">↻ Змінити камеру</button><button id="cloux-camera-timer">⏱ 0 с</button><button class="primary" id="cloux-camera-photo">● Фото</button><button id="cloux-camera-record">◎ Відеокружок</button></div><p id="cloux-camera-status" style="color:var(--text-dim);font-size:12px"></p></div>';
 let secondsDelay=0,recordingVideo=false;
 const close=()=>{cancel();target.hidden=true};
 $('cloux-camera-close').onclick=close;
 $('cloux-camera-flip').onclick=async()=>{facing=facing==='user'?'environment':'user';try{await setup()}catch{onError('Не вдалося змінити камеру')}};
 $('cloux-camera-timer').onclick=()=>{secondsDelay=secondsDelay===0?3:secondsDelay===3?5:0;$('cloux-camera-timer').textContent='⏱ '+secondsDelay+' с'};
 $('cloux-camera-photo').onclick=async()=>{
  const frameVideo=$('cloux-camera-video');if(!frameVideo?.videoWidth){onError('Зачекай, поки камера ввімкнеться');return}
  const button=$('cloux-camera-photo');button.disabled=true;
  for(let t=secondsDelay;t>0;t--){onState('Фото через '+t+'…');await new Promise(resolve=>setTimeout(resolve,1000));if(target.hidden)return}
  const cv=document.createElement('canvas');cv.width=frameVideo.videoWidth;cv.height=frameVideo.videoHeight;
  const context=cv.getContext('2d');if(!context){button.disabled=false;return}
  if(facing==='user'){context.translate(cv.width,0);context.scale(-1,1)}
  context.drawImage(frameVideo,0,0);
  const flash=document.createElement('div');flash.style.cssText='position:fixed;inset:0;z-index:90;background:#fff;pointer-events:none';document.body.append(flash);
  flash.animate([{opacity:.9},{opacity:0}],{duration:270}).finished.finally(()=>flash.remove());
  cv.toBlob(b=>{if(b){onFile(new File([b],'cloux-photo-'+Date.now()+'.jpg',{type:'image/jpeg'}));close()}},'image/jpeg',.91);
  button.disabled=false;
 };
 $('cloux-camera-record').onclick=async()=>{
  if(recordingVideo){finishVoice();return}
  if(!navigator.mediaDevices?.getUserMedia||!stream)return;
  try{
   const audio=await navigator.mediaDevices.getUserMedia({audio:true});
   audio.getAudioTracks().forEach(track=>stream.addTrack(track));
   recordingVideo=true;
   const captureVideo=$('cloux-camera-video');
   captureVideo.style.borderRadius='50%';captureVideo.style.aspectRatio='1';captureVideo.style.width='min(290px,100%)';
   $('cloux-camera-record').textContent='■ Завершити';
   $('cloux-camera-photo').disabled=true;
   startRecorder(stream,'video',file=>{recordingVideo=false;onFile(file);target.hidden=true},msg=>{$('cloux-camera-status').textContent=msg;onState(msg)},30);
  }catch(e){recordingVideo=false;onError('Для відеокружка потрібен мікрофон і підтримка запису: '+(e?.message||''))}
 };
 try{await setup()}catch(e){target.hidden=true;onError(e?.name==='NotAllowedError'?'Доступ до камери заборонено':'Камера недоступна')}
}
window.ClouxStudioMedia={voice,finishVoice,cancelVoice,camera,stop:cancel,isRecording:()=>recorder?.state==='recording'};
})();
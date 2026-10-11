/* Cloux media: authenticated file uploads and recorded voice messages. */
(function(){
'use strict';
const oldOpenChat=openChat;
const css=`
.cloux-media-btn{border:1px solid #ffffff30;background:#ffffff15;color:#eee;border-radius:13px;min-width:40px;height:44px;padding:6px;font-size:20px}
.cloux-media-btn:disabled{opacity:.4}
.cloux-media-recording{background:#eee!important;color:#121212!important;animation:cloux-pulse 1s ease-in-out infinite alternate}
@keyframes cloux-pulse{from{opacity:1}to{opacity:.52}}
@media(max-width:650px){.cloux-media-btn{min-width:33px;height:42px;font-size:18px}}
`;const style=document.createElement('style');style.textContent=css;document.head.append(style);
async function upload(cid,blob,name,type){
 if(blob.size>5*1024*1024)throw Error('Максимальний розмір файлу — 5 МБ.');
 const response=await fetch('/api/chats/'+encodeURIComponent(cid)+'/media',{method:'POST',credentials:'same-origin',headers:{'Content-Type':type,'X-Cloux-Filename':encodeURIComponent(name)},body:blob});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.detail||'Не вдалося надіслати файл.');
 const body=document.getElementById('chat-body');if(body)body.innerHTML='';
 state.lastId=0;state.renderedIds.clear();
 await refreshMessages();await loadChats();
}
openChat=async function(cid){
 await oldOpenChat(cid);
 const form=document.getElementById('composer');if(!form)return;
 const attach=document.createElement('button');attach.type='button';attach.className='cloux-media-btn';attach.title='Надіслати фото, файл або відео';attach.textContent='📎';
 const files=document.createElement('input');files.type='file';files.hidden=true;files.accept='image/jpeg,image/png,image/webp,image/gif,audio/webm,audio/ogg,audio/mpeg,audio/mp4,video/webm,video/mp4,application/pdf';
 files.addEventListener('change',async()=>{
  const file=files.files?.[0];if(!file)return;
  attach.disabled=true;
  try{await upload(cid,file,file.name,file.type);}catch(e){alert(e.message);}
  finally{files.value='';attach.disabled=false;}
 });
 attach.onclick=()=>files.click();
 form.prepend(files);form.prepend(attach);
 const voice=document.createElement('button');voice.type='button';voice.className='cloux-media-btn';voice.title='Записати голосове повідомлення';voice.textContent='🎙️';
 let recording=null;
 voice.onclick=async()=>{
  if(recording){recording.stop();return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){alert('Браузер не підтримує голосові.');return;}
  let stream;
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
   const available=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(m=>MediaRecorder.isTypeSupported(m));
   if(!available){stream.getTracks().forEach(t=>t.stop());alert('Запис голосових тут не підтримується.');return;}
   const rec=new MediaRecorder(stream,{mimeType:available});
   const parts=[];
   rec.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
   rec.onstop=async()=>{
    clearTimeout(rec.timer);
    recording=null;voice.textContent='🎙️';voice.classList.remove('cloux-media-recording');voice.disabled=true;
    stream.getTracks().forEach(t=>t.stop());
    try{const blob=new Blob(parts,{type:available});if(blob.size)await upload(cid,blob,'Голосове.webm',available.split(';')[0]);}
    catch(e){alert(e.message);}finally{voice.disabled=false;}
   };
   rec.onerror=()=>{stream.getTracks().forEach(t=>t.stop());recording=null;voice.classList.remove('cloux-media-recording');};
   recording=rec;voice.textContent='⏹️';voice.classList.add('cloux-media-recording');
   rec.start(1000);
   rec.timer=setTimeout(()=>{if(rec.state==='recording')rec.stop();},60000);
  }catch(e){if(stream)stream.getTracks().forEach(t=>t.stop());alert('Потрібен дозвіл на мікрофон для голосових.');}
 };
 form.prepend(voice);
};
})();
/* CLOUX custom UI: footer, themes and profile cropper. API persists actual profile files. */
(function(){
'use strict';
const $=(q,root=document)=>root.querySelector(q),$$=(q,root=document)=>Array.from(root.querySelectorAll(q));
const DEFAULT='/assets/cloux-default-avatar.jpg';
const LEGAL='<p><strong>Власник: Ільяс та його команда</strong></p><p><a href="mailto:grebenjuk13@gmail.com">grebenjuk13@gmail.com</a></p><span class="cloux-line-break"></span><p>Проєкт ClouX є незалежним меседжером<br>Соц мережа та не пов’язаний з шахрайством.</p><span class="cloux-line-break"></span><p>© 2026 CLOUX. Копіювання заборонено!</p>';
const themes=[['crimson','Crimson Noir','#e10600','#090607'],['gold','Obsidian Gold','#bb8b36','#090808'],['aurora','Neon Aurora','#34c5b6','#080b14'],['ice','Ice Glass','#75bee4','#0b151c'],['violet','Royal Violet','#a674ed','#110a1b'],['emerald','Emerald Night','#59bf8d','#07130e'],['sunset','Sunset Mesh','#fa6b6f','#170b11'],['amoled','AMOLED Black','#f31524','#000'],['light','Light Studio','#a51d2b','#f4f1f4']];
const read=(k,fall='')=>{try{return localStorage.getItem('cloux:custom:'+k)||fall}catch{return fall}};
const write=(k,v)=>{try{localStorage.setItem('cloux:custom:'+k,String(v))}catch{}};
let modal=null,stream=null,source=null,image=null,kind='avatar',zoom=1,offsetX=0,offsetY=0,angle=0,flipped=false,filters={brightness:100,contrast:100,saturation:100,blur:0,dim:0},history=[],redoStack=[],activeId='',cachedAvatar='',cachedBanner='',updateTimer=0;
function foot(){
 let el=$('.cloux-legal-footer:not(.cloux-settings-legal)');
 if(!el){el=document.createElement('footer');el.className='cloux-legal-footer';el.setAttribute('aria-label','Власник Cloux та авторські права');el.innerHTML=LEGAL;document.body.append(el)}
 const about=Array.from(document.querySelectorAll('.settings-view h3')).find(el=>el.textContent.trim()==='Cloux Messenger');
 if(about&&!$('.cloux-settings-legal')){const info=document.createElement('div');info.className='cloux-settings-legal cloux-legal-footer';info.innerHTML=LEGAL;about.parentElement.append(info)}
}
function updateTheme(name,position){
 const theme=themes.find(t=>t[0]===name);if(!theme)return;
 if(position&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const circle=document.createElement('span');circle.style.cssText='position:fixed;z-index:10000;pointer-events:none;width:1px;height:1px;left:'+position.x+'px;top:'+position.y+'px;background:'+theme[3]+';border-radius:50%';document.body.append(circle);
  circle.animate([{transform:'translate(-50%,-50%) scale(1)',opacity:.9},{transform:'translate(-50%,-50%) scale(2400)',opacity:0}],{duration:430,easing:'ease-out'}).finished.finally(()=>circle.remove());
 }
 document.documentElement.dataset.clouxTheme=name;write('theme',name);
 document.documentElement.style.setProperty('--cloux-highlight',read('accent',theme[2]));
 const meta=$('meta[name=theme-color]');if(meta)meta.content=theme[3];
}
function openModal(title,content){
 closeModal();modal=document.createElement('div');modal.className='cloux-global-layer';modal.innerHTML='<section class="cloux-modal" role="dialog" aria-modal="true" aria-label="'+title+'"><button class="cloux-close" data-close aria-label="Закрити">✕</button><h2>'+title+'</h2>'+content+'</section>';document.body.append(modal);
 $('[data-close]',modal).onclick=closeModal;modal.addEventListener('mousedown',e=>{if(e.target===modal)closeModal()});
}
function closeModal(){
 if(stream){stream.getTracks().forEach(x=>x.stop());stream=null}
 if(modal){modal.remove();modal=null}
 if(source?.startsWith('blob:'))URL.revokeObjectURL(source);
 source=null;image=null;
}
function status(text){const p=$('.cloux-status',modal);if(p)p.textContent=text}
function themePanel(){
 openModal('Теми Cloux','<p>Теми зберігаються лише для цього пристрою.</p><div class="cloux-grid">'+themes.map(t=>'<button class="cloux-theme-card" data-theme="'+t[0]+'" style="background:linear-gradient(120deg,'+t[3]+','+t[2]+'99);color:'+(t[0]==='light'?'#171318':'#fff')+'"><span class="cloux-swatch" style="background:'+t[2]+'"></span>'+t[1]+'</button>').join('')+'</div><div class="cloux-grid cloux-section"><label>Власний акцент<input type="color" id="ct-accent" value="'+read('accent','#e10600')+'"></label><label>Розмір тексту<input type="range" id="ct-font" min="12" max="21" value="'+read('font','15')+'"></label><label>Заокруглення<select id="ct-radius"><option value="18">М’яке</option><option value="8">Компактне</option><option value="27">Liquid Glass</option></select></label><label>Розмивати чати при втраті фокусу<input type="checkbox" id="ct-blur" '+(read('blur')==='1'?'checked':'')+'></label></div>');
 $$('[data-theme]',modal).forEach(el=>el.onclick=e=>updateTheme(el.dataset.theme,{x:e.clientX,y:e.clientY}));
 $('#ct-accent',modal).oninput=e=>{write('accent',e.target.value);document.documentElement.style.setProperty('--cloux-highlight',e.target.value)};
 $('#ct-font',modal).oninput=e=>{write('font',e.target.value);document.documentElement.style.setProperty('--font-size',e.target.value+'px')};
 $('#ct-radius',modal).value=read('radius','18');$('#ct-radius',modal).onchange=e=>{write('radius',e.target.value);document.documentElement.style.setProperty('--cloux-radius',e.target.value+'px')};
 $('#ct-blur',modal).onchange=e=>{write('blur',e.target.checked?'1':'0');document.documentElement.dataset.clouxBlur=e.target.checked?'1':'0'};
}
async function user(){
 const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Спочатку увійди у свій акаунт Cloux.');return r.json();
}
const blobOf=(canvas,type='image/webp',quality=.86)=>new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(new Error('Не вдалося зберегти фото')),type,quality));
function fileSave(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function indexed(){
 return new Promise((resolve,reject)=>{const request=indexedDB.open('cloux:images',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('photos'))request.result.createObjectStore('photos')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
}
async function storePhoto(key,blob){
 const db=await indexed();await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(blob,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
}
async function accept(file){
 if(!file)throw Error('Фото не вибрано');
 if(file.size>12*1024*1024)throw Error('Максимальний розмір зображення 12 МБ');
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw Error('Дозволені JPEG, PNG, WebP та GIF (перший кадр)');
 const url=URL.createObjectURL(file),img=new Image();img.src=url;
 try{await img.decode();if(img.width*img.height>25000000)throw Error('Зображення більше 25 мегапікселів');if(source?.startsWith('blob:'))URL.revokeObjectURL(source);source=url;image=img;zoom=1;offsetX=offsetY=angle=0;flipped=false;history=[];redoStack=[];refreshControls();draw()}catch(e){URL.revokeObjectURL(url);throw e}
}
function snapshot(){history.push({zoom,offsetX,offsetY,angle,flipped,filters:{...filters}});if(history.length>30)history.shift();redoStack=[]}
function restore(s){if(!s)return;({zoom,offsetX,offsetY,angle,flipped}=s);filters={...s.filters};refreshControls();draw()}
function undo(){if(!history.length)return;redoStack.push({zoom,offsetX,offsetY,angle,flipped,filters:{...filters}});restore(history.pop())}
function redo(){if(!redoStack.length)return;history.push({zoom,offsetX,offsetY,angle,flipped,filters:{...filters}});restore(redoStack.pop())}
function refreshControls(){
 if(!modal)return;
 for(const k of ['zoom','brightness','contrast','saturation','blur','dim']){const el=$('#ce-'+k,modal);if(el)el.value=k==='zoom'?zoom:filters[k]}
}
function render(ctx,w,h,isOutput=false){
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#140a0f';ctx.fillRect(0,0,w,h);
 if(!image){ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='16px Inter';ctx.fillText('Обери зображення',w/2,h/2);return}
 const view=$('#ce-canvas',modal);const sx=isOutput?w/view.width:1,sy=isOutput?h/view.height:1;
 ctx.save();if(!isOutput&&kind==='avatar'){ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)/2-2,0,2*Math.PI);ctx.clip()}
 ctx.translate(w/2+offsetX*sx,h/2+offsetY*sy);ctx.rotate(angle*Math.PI/180);
 const sc=Math.max(w/image.width,h/image.height)*zoom;ctx.scale(flipped?-sc:sc,sc);
 ctx.filter='brightness('+filters.brightness+'%) contrast('+filters.contrast+'%) saturate('+filters.saturation+'%) blur('+(filters.blur*sx)+'px)';
 ctx.drawImage(image,-image.width/2,-image.height/2);ctx.restore();
 if(filters.dim){ctx.fillStyle='rgba(0,0,0,'+(filters.dim/100)+')';ctx.fillRect(0,0,w,h)}
 if(!isOutput){ctx.strokeStyle='#ffffff88';ctx.lineWidth=2;if(kind==='avatar'){ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)/2-3,0,2*Math.PI);ctx.stroke()}else ctx.strokeRect(2,2,w-4,h-4)}
}
function draw(){const canvas=$('#ce-canvas',modal);if(canvas)render(canvas.getContext('2d'),canvas.width,canvas.height)}
async function resultBlob(){if(!image)throw Error('Спочатку вибери зображення');const canvas=document.createElement('canvas');canvas.width=kind==='avatar'?640:1500;canvas.height=kind==='avatar'?640:500;render(canvas.getContext('2d'),canvas.width,canvas.height,true);return blobOf(canvas)}
function applyPhoto(which,url){
 if(which==='avatar'){
  for(const node of document.querySelectorAll('.settings-profile .avatar img, .settings-view .avatar img, .avatar-large img')){
   if(node.getAttribute('src')!==url)node.src=url;
  }
 }else{
  for(const el of document.querySelectorAll('.settings-profile'))el.style.backgroundImage='linear-gradient(transparent,#0005),url("'+url+'")';
 }
}
async function persist(){
 const id=await user(),blob=await resultBlob();
 const r=await fetch('/api/profile/media/'+kind,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'image/webp'},body:blob});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.detail||'Зображення не вдалося надіслати');
 storePhoto(id.id+':'+kind,blob).catch(()=>{});
 const url=data.url||'/api/profile/'+encodeURIComponent(id.id)+'/media/'+kind+'?v='+Date.now();
 if(kind==='avatar')cachedAvatar=url;else cachedBanner=url;
 applyPhoto(kind,url);document.dispatchEvent(new CustomEvent('cloux:profile-photo',{detail:{kind,url}}));
}
async function preset(){
 const c=document.createElement('canvas');c.width=kind==='avatar'?600:1500;c.height=kind==='avatar'?600:500;
 const ctx=c.getContext('2d'),colors=['#e10600','#090909','#380017'];const g=ctx.createLinearGradient(0,0,c.width,c.height);g.addColorStop(0,colors[0]);g.addColorStop(1,colors[2]);ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);
 if(kind==='avatar'){
  const value=prompt('Ініціали на аватарці (1–3 символи)','CX');if(value===null)return;
  ctx.fillStyle='#fff';ctx.font='800 190px Inter';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value.slice(0,3).toUpperCase(),c.width/2,c.height/2);
 }else{for(let i=0;i<7;i++){ctx.beginPath();ctx.ellipse(100+225*i,100+90*Math.sin(i),270,85,.3*i,0,Math.PI*2);ctx.strokeStyle='#ffffff22';ctx.lineWidth=28;ctx.stroke()}}
 const b=await blobOf(c);await accept(new File([b],'cloux-preset.webp',{type:'image/webp'}));
}
async function captureCamera(){
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Камера потребує HTTPS або localhost');
 const el=$('#ce-camera',modal);stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
 el.innerHTML='<video id="ce-video" autoplay muted playsinline style="width:100%;max-height:220px;object-fit:contain;transform:scaleX(-1)"></video><div class="cloux-tools"><button id="ce-shot">Зробити фото</button><select id="ce-delay"><option value="0">Зараз</option><option value="3">3 с</option><option value="5">5 с</option></select></div>';
 const video=$('#ce-video',el);video.srcObject=stream;void video.play();
 $('#ce-shot',el).onclick=async()=>{
  const b=$('#ce-shot',el);b.disabled=true;const t=Number($('#ce-delay',el).value);
  for(let i=t;i>0;i--){b.textContent='Фото через '+i;await new Promise(r=>setTimeout(r,1000));if(!el.isConnected)return}
  if(!video.videoWidth){status('Камера ще завантажується');b.disabled=false;return}
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const ctx=canvas.getContext('2d');ctx.translate(canvas.width,0);ctx.scale(-1,1);ctx.drawImage(video,0,0);
  const f=document.createElement('div');f.style.cssText='position:fixed;inset:0;z-index:6000;background:white;pointer-events:none';document.body.append(f);f.animate([{opacity:.9},{opacity:0}],{duration:200}).finished.finally(()=>f.remove());
  const blob=await blobOf(canvas,'image/jpeg',.9);stream.getTracks().forEach(t=>t.stop());stream=null;el.replaceChildren();
  await accept(new File([blob],'camera.jpg',{type:'image/jpeg'}));
 };
}
function editor(which='avatar'){
 kind=which;zoom=1;offsetX=offsetY=angle=0;flipped=false;filters={brightness:100,contrast:100,saturation:100,blur:0,dim:0};
 openModal(which==='avatar'?'Аватарка · редактор':'Банер · редактор',
 '<p>Галерея, камера, URL, перетягування, Ctrl+V, масштаб і фільтри. Зберігається на сервері Cloux та в локальному кеші.</p><div class="cloux-drop" id="ce-drop">Перетягни сюди фото або встав Ctrl+V</div>'+
 '<div class="cloux-tools"><button id="ce-gallery">Галерея</button><button id="ce-camera-button">Камера</button><button id="ce-url">URL</button><button id="ce-preset">Пресет</button><input hidden id="ce-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div><div id="ce-camera"></div>'+
 '<div class="cloux-preview '+which+'" id="ce-area"><canvas id="ce-canvas" width="'+(which==='avatar'?'360':'720')+'" height="'+(which==='avatar'?'360':'240')+'"></canvas></div>'+
 '<div class="cloux-grid">'+[['zoom',1,4,.05,1],['brightness',50,150,1,100],['contrast',50,150,1,100],['saturation',0,200,1,100],['blur',0,12,.5,0],['dim',0,80,1,0]].map(v=>'<label>'+({zoom:'Масштаб',brightness:'Яскравість',contrast:'Контраст',saturation:'Насиченість',blur:'Розмиття',dim:'Затемнення'})[v[0]]+'<input type="range" id="ce-'+v[0]+'" min="'+v[1]+'" max="'+v[2]+'" step="'+v[3]+'" value="'+v[4]+'"></label>').join('')+'</div>'+
 (which==='avatar'?'<div class="cloux-grid"><label>Рамка<select id="ce-frame"><option>Звичайна</option><option>Подвійне кільце</option><option>Градієнт</option><option>Неонове світіння</option><option>Premium</option></select></label><label>Форма<select id="ce-shape"><option>Коло</option><option>Squircle</option><option>Квадрат</option></select></label></div>':'')+
 '<div class="cloux-tools"><button id="ce-left">↶ 90°</button><button id="ce-right">↷ 90°</button><button id="ce-flip">⇄ Дзеркало</button><button id="ce-undo">Скасувати крок</button><button id="ce-redo">Повторити</button></div>'+
 '<div class="cloux-tools"><button id="ce-cancel">Скасувати</button><button id="ce-reset">Повернути оригінал</button><button class="primary" id="ce-apply">Застосувати</button></div><p class="cloux-status" role="status"></p>');
 draw();
 $('#ce-file',modal).onchange=e=>void accept(e.target.files?.[0]).catch(x=>status(x.message));
 $('#ce-gallery',modal).onclick=()=>$('#ce-file',modal).click();
 $('#ce-camera-button',modal).onclick=()=>void captureCamera().catch(x=>status(x.message));
 $('#ce-url',modal).onclick=async()=>{
  const url=prompt('Пряме посилання на зображення (HTTPS):');if(!url)return;
  try{if(new URL(url).protocol!=='https:')throw Error('Потрібне HTTPS');const r=await fetch(url,{mode:'cors'});if(!r.ok)throw Error('Файл не відкривається');const b=await r.blob();await accept(new File([b],'photo.'+(b.type.split('/')[1]||'jpg'),{type:b.type}))}catch(x){status('Фото недоступне (можливо CORS): '+x.message)}
 };
 $('#ce-preset',modal).onclick=()=>void preset().catch(x=>status(x.message));
 const drop=$('#ce-drop',modal);drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();void accept(e.dataTransfer.files?.[0]).catch(x=>status(x.message))};
 modal.addEventListener('paste',e=>{const b=Array.from(e.clipboardData?.items||[]).find(x=>x.type.startsWith('image/'))?.getAsFile();if(b){e.preventDefault();void accept(b).catch(x=>status(x.message))}});
 const stage=$('#ce-area',modal);let point=null;
 stage.onpointerdown=e=>{snapshot();point={x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId)};
 stage.onpointermove=e=>{if(!point)return;const rect=stage.getBoundingClientRect(),c=$('#ce-canvas',modal);offsetX+=(e.clientX-point.x)*c.width/rect.width;offsetY+=(e.clientY-point.y)*c.height/rect.height;point={x:e.clientX,y:e.clientY};draw()};
 stage.onpointerup=()=>point=null;stage.onwheel=e=>{e.preventDefault();snapshot();zoom=Math.max(1,Math.min(4,zoom+(e.deltaY<0?.1:-.1)));refreshControls();draw()};
 for(const key of ['zoom','brightness','contrast','saturation','blur','dim']){
  const slider=$('#ce-'+key,modal);slider.addEventListener('pointerdown',snapshot);
  slider.oninput=e=>{if(key==='zoom')zoom=Number(e.target.value);else filters[key]=Number(e.target.value);draw()};
 }
 $('#ce-left',modal).onclick=()=>{snapshot();angle-=90;draw()};
 $('#ce-right',modal).onclick=()=>{snapshot();angle+=90;draw()};
 $('#ce-flip',modal).onclick=()=>{snapshot();flipped=!flipped;draw()};
 $('#ce-undo',modal).onclick=undo;$('#ce-redo',modal).onclick=redo;
 $('#ce-cancel',modal).onclick=closeModal;
 $('#ce-apply',modal).onclick=async()=>{
  const b=$('#ce-apply',modal);b.disabled=true;status('Збереження…');
  try{await persist();status('Збережено у Cloux');setTimeout(closeModal,600)}catch(x){status(x.message);b.disabled=false}
 };
 $('#ce-reset',modal).onclick=async()=>{
  try{const u=await user();if(!confirm('Повернути стандартну аватарку чи банер?'))return;
   const r=await fetch('/api/profile/media/'+kind,{method:'DELETE',credentials:'same-origin'});if(!r.ok)throw Error('Сервер не прийняв запит');
   if(kind==='avatar'){cachedAvatar='';applyPhoto('avatar',DEFAULT)}else{cachedBanner='';$$('.settings-profile').forEach(el=>el.style.backgroundImage='')}
   closeModal();
  }catch(x){status(x.message)}
 };
}
async function profilePanel(){
 openModal('Профіль CLOUX','<p>Створюй і редагуй фото профілю та банер. Поточні чати й акаунт не видаляються.</p><div class="cloux-tools"><button id="cp-avatar">Аватарка</button><button id="cp-banner">Банер</button><button id="cp-theme">Теми</button><button id="cp-export">Експорт JSON</button><button id="cp-import">Імпорт JSON</button><input hidden type="file" accept="application/json" id="cp-file"></div><div class="cloux-profile-card"><div class="cloux-banner-sample"></div><div class="cloux-profile-card-inner"><img id="cp-image" src="'+(cachedAvatar||DEFAULT)+'"><div><b id="cp-display">Cloux</b><p id="cp-username"></p></div></div></div><div class="cloux-tools"><button id="cp-png">Зберегти PNG-картку</button><button id="cp-link">Копіювати посилання</button></div><p class="cloux-status" role="status"></p>');
 $('#cp-avatar',modal).onclick=()=>editor('avatar');$('#cp-banner',modal).onclick=()=>editor('banner');$('#cp-theme',modal).onclick=themePanel;
 let me=null;try{me=await user();if(!modal)return;$('#cp-display',modal).textContent=me.display;$('#cp-username',modal).textContent='@'+me.username}catch(x){status(x.message)}
 $('#cp-export',modal).onclick=()=>{
  const out={version:1,appearance:{theme:read('theme','crimson'),accent:read('accent','#e10600')},profile:{display:me?.display,username:me?.username}};
  fileSave(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}),'Cloux-profile.json')
 };
 $('#cp-import',modal).onclick=()=>$('#cp-file',modal).click();
 $('#cp-file',modal).onchange=async e=>{
  const f=e.target.files?.[0];if(!f||f.size>100000){status('Максимум 100 КБ JSON');return}
  try{const data=JSON.parse(await f.text());if(data.version!==1||!themes.some(t=>t[0]===data.appearance?.theme))throw Error('Неправильний формат');updateTheme(data.appearance.theme);status('Тему імпортовано. Особисті дані не змінено.')}catch(x){status(x.message)}
 };
 $('#cp-link',modal).onclick=async()=>{if(!me){status('Потрібен вхід');return}const link=location.origin+'/v5/?user='+encodeURIComponent(me.username);try{await navigator.clipboard.writeText(link);status('Посилання скопійоване; потрібен вхід до Cloux')}catch{status(link)}};
 $('#cp-png',modal).onclick=async()=>{
  if(!me){status('Потрібен вхід');return}
  try{
   const c=document.createElement('canvas');c.width=1024;c.height=640;const ctx=c.getContext('2d');ctx.fillStyle='#130810';ctx.fillRect(0,0,1024,640);
   const g=ctx.createLinearGradient(0,0,1024,330);g.addColorStop(0,'#e10600');g.addColorStop(1,'#25000b');ctx.fillStyle=g;ctx.fillRect(0,0,1024,300);
   const img=new Image();img.src=cachedAvatar||DEFAULT;await img.decode();ctx.save();ctx.beginPath();ctx.arc(145,315,105,0,2*Math.PI);ctx.clip();ctx.drawImage(img,40,210,210,210);ctx.restore();
   ctx.fillStyle='#fff';ctx.font='bold 55px Inter';ctx.fillText(me.display,280,340);ctx.font='28px Inter';ctx.fillText('@'+me.username,280,396);
   ctx.fillText('CLOUX',60,565);fileSave(await blobOf(c,'image/png'),'Cloux-profile.png')
  }catch(x){status(x.message)}
 };
}
function attach(){
 foot();
 const root=$('.settings-view');if(!root)return;
 if(!$('#cloux-profile-tools')){
  const b=document.createElement('button');b.id='cloux-profile-tools';b.className='cloux-profile-launch';b.textContent='✦ Редактор аватарки, банера та 9 тем';b.onclick=()=>void profilePanel();
  const ref=$('.settings-profile',root);if(ref)ref.after(b);else root.prepend(b);
 }
 if(cachedAvatar)applyPhoto('avatar',cachedAvatar);
 if(cachedBanner)applyPhoto('banner',cachedBanner);
}
async function fetchCurrent(){
 try{
  const me=await user();if(activeId===me.id)return;activeId=me.id;
  const urls=['avatar','banner'];for(const k of urls){
   const url='/api/profile/'+encodeURIComponent(me.id)+'/media/'+k+'?v='+Date.now();
   const resp=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(!resp.ok)continue;
   if(k==='avatar')cachedAvatar=url;else cachedBanner=url;applyPhoto(k,url);
  }
 }catch{}
}
function init(){
 updateTheme(read('theme','crimson'));document.documentElement.dataset.clouxBlur=read('blur','0');
 document.documentElement.style.setProperty('--font-size',read('font','15')+'px');
 foot();attach();
 const root=$('#root');
 if(root){
  const observer=new MutationObserver(()=>{clearTimeout(updateTimer);updateTimer=setTimeout(attach,180)});
  observer.observe(root,{subtree:true,childList:true});
 }
 document.addEventListener('cloux:open-editor',e=>editor(e.detail?.kind||'avatar'));
 document.addEventListener('cloux:open-themes',themePanel);
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal)closeModal();if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();void profilePanel()}});
 setTimeout(()=>void fetchCurrent(),2200);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void fetchCurrent()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.ClouxCustomize={themePanel,editor,profilePanel,LEGAL};
})();
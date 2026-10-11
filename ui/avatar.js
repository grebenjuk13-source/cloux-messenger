import {$,esc,cachePhoto,saveLocal,S,api,toast,BASE_AVATAR} from './core.js';
/** File picker + draggable square avatar crop with zoom. The default asset is never changed. */
export async function cropAndUpload(kind,onReady){
 const picker=document.createElement('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp';picker.style.display='none';document.body.append(picker);
 picker.onchange=async()=>{const file=picker.files?.[0];picker.remove();if(!file)return;
  if(file.size>6_000_000){toast('Фото завелике (максимум 6 МБ)');return}
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>showCrop(img,url,kind,onReady);
  img.onerror=()=>{URL.revokeObjectURL(url);toast('Файл не відкрився')};img.src=url;
 };
 picker.click();
}
function showCrop(img,url,kind,onReady){
 const square=kind==='avatar',width=480,height=square?480:260;
 const layer=document.createElement('div');layer.className='sheet';
 layer.innerHTML=`<section class="sheet-inner"><h2>Обрізати ${square?'аватар':'зображення'}</h2><canvas class="crop-view" width="${width}" height="${height}" aria-label="Попередній перегляд обрізання"></canvas><div class="crop-tools"><span>−</span><input type="range" min="1" max="2.5" value="1" step="0.02" aria-label="Масштаб"><span>+</span></div><div style="display:flex;gap:10px;justify-content:flex-end"><button class="outline" data-cancel>Скасувати</button><button class="primary" data-save>Обрізати та зберегти</button></div></section>`;
 document.body.append(layer);const canvas=$('canvas',layer),ctx=canvas.getContext('2d'),slider=$('input',layer);
 let dx=0,dy=0,drag=null;
 const base=Math.max(width/img.width,height/img.height);
 function draw(){const scale=base*Number(slider.value),iw=img.width*scale,ih=img.height*scale;
  const x=Math.max(width-iw,Math.min(0,(width-iw)/2+dx)),y=Math.max(height-ih,Math.min(0,(height-ih)/2+dy));
  ctx.clearRect(0,0,width,height);ctx.drawImage(img,x,y,iw,ih);
 }
 slider.oninput=draw;
 canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)};
 canvas.onpointermove=e=>{if(!drag)return;const factor=width/canvas.getBoundingClientRect().width;dx+=(e.clientX-drag.x)*factor;dy+=(e.clientY-drag.y)*factor;drag={x:e.clientX,y:e.clientY};draw()};
 canvas.onpointerup=()=>{drag=null};
 const close=()=>{URL.revokeObjectURL(url);layer.remove()};
 $('[data-cancel]',layer).onclick=close;
 $('[data-save]',layer).onclick=async()=>{
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!blob){toast('Не вдалося зберегти фото');return}
  const key=`${S.me.id}-${kind}`;await cachePhoto(key,blob);
  const localUrl=URL.createObjectURL(blob);saveLocal({[kind+'CacheVersion']:Date.now()});
  close();onReady?.(localUrl);
  try{const response=await fetch('/api/profile/media/'+kind,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'image/webp'},body:blob});
  if(!response.ok){let r=await response.json().catch(()=>({}));throw Error(r.detail||'Сервер не прийняв фото')}
  toast('Фото збережено на пристрої та сервері');
  }catch(e){toast('На пристрої збережено. Сервер: '+e.message)};
 };
 draw();
}
export async function getPhotoUrl(kind){
 const blob=await import('./core.js').then(x=>x.cachedPhoto(`${S.me.id}-${kind}`));
 if(blob)return URL.createObjectURL(blob);
 return `/api/profile/${S.me.id}/media/${kind}`;
}
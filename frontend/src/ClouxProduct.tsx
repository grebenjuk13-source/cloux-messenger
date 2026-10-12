import React,{useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Check,ChevronRight,ImagePlus,Lock,Menu,Pencil,Palette,Plus,Search,Settings,Shield,Users,Video,X,MessageCircle,RefreshCw,Cloud,Volume2,Monitor,Sun,Moon} from 'lucide-react';
import {wallpapers} from './design';
import './cloux-product.css';

const DEFAULT_AVATAR='/assets/cloux-default-avatar.jpg';
type Person={id:string;display:string;username:string;photo_version?:number;online?:boolean};
export type Wallpaper={kind:'preset'|'gradient'|'image';preset:string;colors:string[];angle:number;pattern:'none'|'dots'|'lines'|'stars'|'grid';intensity:number;blur:number;dim:number;animate:boolean;parallax:boolean};
const defaultWall:Wallpaper={kind:'preset',preset:'w0',colors:['#180b14','#05060b'],angle:135,pattern:'none',intensity:15,blur:0,dim:12,animate:false,parallax:false};
type Profile=Person&{bio:string;status:string;last_seen:number;friends_count:number;friendship:'self'|'friend'|'incoming'|'outgoing'|'none';mutual:Person[];friends_visible:boolean;accent:string;banner_gradient:string;status_icon:string;banner_video:boolean};
export type ClientUser=Person;
type ProductSettings={friends_visibility:'all'|'friends'|'none';show_online:boolean;allow_requests:boolean;allow_calls:boolean;show_message_preview:boolean;notifications_messages:boolean;notifications_calls:boolean;notifications_sound:boolean;language:'uk';backup_interval:'off'|'daily'|'weekly';profile_accent:string;banner_gradient:string;status_icon:string};
const defaultSettings:ProductSettings={friends_visibility:'all',show_online:true,allow_requests:true,allow_calls:true,show_message_preview:true,notifications_messages:true,notifications_calls:true,notifications_sound:true,language:'uk',backup_interval:'off',profile_accent:'#E11D2E',banner_gradient:'linear-gradient(120deg,#390c1b,#08090e)',status_icon:'✨'};
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const res=await fetch(path,{method,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.detail||'Помилка: '+res.status);
 return data as T;
}
export async function loadChatWallpaper(chatId:string,mode:'dark'|'light'){
 const read=async (scope:string)=>request<{wallpaper:Wallpaper|null}>('/api/cloux/wallpaper?scope='+encodeURIComponent(scope)+'&mode='+mode);
 try{const chat=await read(chatId);if(chat.wallpaper)return {wallpaper:chat.wallpaper,scope:chatId};const all=await read('all');return {wallpaper:all.wallpaper,scope:'all'}}catch{return {wallpaper:null,scope:'all'}}
}
export function wallpaperCSS(style:Wallpaper|null,scope:string,mode:'dark'|'light',fallback:string):React.CSSProperties{
 if(!style)return {backgroundImage:fallback,backgroundSize:'cover'};
 if(style.kind==='image')return {backgroundImage:'url("/api/cloux/wallpaper/media?scope='+encodeURIComponent(scope)+'&mode='+mode+'")',backgroundSize:'cover'};
 if(style.kind==='preset')return {backgroundImage:wallpapers.find(x=>x.id===style.preset)?.style||fallback,backgroundSize:'cover'};
 const colors=style.colors.length===1?[style.colors[0],style.colors[0]]:style.colors;
 return {backgroundImage:'linear-gradient('+style.angle+'deg,'+colors.join(',')+')',backgroundSize:style.animate?'240% 240%':'cover'};
}
export function wallpaperPattern(style:Wallpaper|null):React.CSSProperties{
 const strength=style?.intensity??0;
 return {'--cloux-pattern-opacity':String(strength/100),'--cloux-pattern':style?.pattern||'none'} as React.CSSProperties;
}
const avatarOf=(p:Person)=>p.id?'/api/profile/'+encodeURIComponent(p.id)+'/media/avatar?v='+(p.photo_version??0):DEFAULT_AVATAR;
function Avatar({person,size=54}:{person:Person;size?:number}){
 return <img className="cx-avatar" style={{width:size,height:size}} src={avatarOf(person)} alt={person.display} onError={e=>{if(!e.currentTarget.src.endsWith(DEFAULT_AVATAR))e.currentTarget.src=DEFAULT_AVATAR}}/>;
}
function RequestNotice({message}:{message:string}){return message?<p className="cx-notice" role="status">{message}</p>:null}

export function ProfileScreen({me,uid,onSettings,onMessage,onOpenUser,onBack}:{me:ClientUser;uid:string;onSettings:()=>void;onMessage:(uid:string)=>void;onOpenUser:(uid:string)=>void;onBack?:()=>void}){
 const [profile,setProfile]=useState<Profile|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [list,setList]=useState(false),[friends,setFriends]=useState<Person[]>([]),[q,setQ]=useState(''),[sort,setSort]=useState<'name'|'online'>('name');
 const [requests,setRequests]=useState<{incoming:Person[];outgoing:Person[]}>({incoming:[],outgoing:[]});
 const [edit,setEdit]=useState(false),[name,setName]=useState(''),[username,setUsername]=useState(''),[bio,setBio]=useState(''),[status,setStatus]=useState(''),[accent,setAccent]=useState('#E11D2E'),[bannerColor,setBannerColor]=useState('#390c1b');
 const [busy,setBusy]=useState(false),[version,setVersion]=useState(0),[icon,setIcon]=useState('✨');
 const self=uid===me.id;
 const reload=()=>request<{profile:Profile}>('/api/cloux/profile/'+encodeURIComponent(uid)).then(r=>{setProfile(r.profile);setName(r.profile.display);setUsername(r.profile.username);setBio(r.profile.bio);setStatus(r.profile.status);setAccent(r.profile.accent);setIcon(r.profile.status_icon);setBannerColor((r.profile.banner_gradient.match(/#[0-9a-fA-F]{6}/)||['#390c1b'])[0]);setError('')}).catch(e=>setError(e.message)).finally(()=>setLoading(false));
 useEffect(()=>{setLoading(true);setList(false);void reload()},[uid]);
 useEffect(()=>{const handler=()=>{setVersion(v=>v+1);void reload()};document.addEventListener('cloux:profile-photo',handler);return()=>document.removeEventListener('cloux:profile-photo',handler)},[uid]);
 useEffect(()=>{if(!list)return;request<{friends:Person[]}>('/api/cloux/friends/'+encodeURIComponent(uid)+'?q='+encodeURIComponent(q)+'&sort='+sort).then(d=>setFriends(d.friends)).catch(e=>setError(e.message))},[list,uid,q,sort,version]);
 useEffect(()=>{if(self)request<{incoming:Person[];outgoing:Person[]}>('/api/cloux/friend-requests').then(setRequests).catch(()=>{})},[uid,version]);
 const friendAction=async(method:'POST'|'DELETE',route:string)=>{setBusy(true);try{await request('/api/cloux/friends/'+encodeURIComponent(route)+(method==='POST'?(profile?.friendship==='incoming'?'/accept':'/request'):''),method);setVersion(n=>n+1);await reload()}catch(e){setError(e instanceof Error?e.message:'Не вдалося змінити дружбу')}finally{setBusy(false)}};
 const save=async()=>{setBusy(true);try{
  await request('/api/profile','PATCH',{display:name.trim(),username:username.trim().toLowerCase(),bio:bio.trim()});
  await request('/api/profile/status','PATCH',{status:status.trim()});
  await request('/api/cloux/profile/style','PATCH',{profile_accent:accent,banner_gradient:'linear-gradient(120deg,'+bannerColor+',#08090e)',status_icon:icon||'✨'});
  setEdit(false);await reload();
 }catch(e){setError(e instanceof Error?e.message:'Не вдалося змінити профіль')}finally{setBusy(false)}};

 const uploadSpecial=async(file:File,kind:'video'|'animated')=>{setBusy(true);setError('');try{
  const addr=kind==='video'?'/api/cloux/banner/video':'/api/cloux/avatar/animated';
  const response=await fetch(addr,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file});
  const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.detail||'Не вдалося зберегти файл');
  setVersion(v=>v+1);await reload();
 }catch(e){setError(e instanceof Error?e.message:'Не вдалося завантажити')}finally{setBusy(false)}};
 if(loading)return <div className="cx-profile-screen"><div className="cx-skeleton cx-banner"/><div className="cx-skeleton cx-skeleton-title"/><div className="cx-skeleton cx-skeleton-title"/></div>;
 if(!profile)return <div className="cx-profile-screen"><RequestNotice message={error}/></div>;
 return <section className="cx-profile-screen">
  <div className="cx-profile-banner" style={{backgroundImage:'url("/api/profile/'+encodeURIComponent(uid)+'/media/banner?v='+((profile.photo_version||0)+version)+'"),'+profile.banner_gradient}}>
   {profile.banner_video&&<video className="cx-banner-video" src={'/api/cloux/banner/video/'+encodeURIComponent(uid)+'?v='+version} autoPlay muted loop playsInline aria-label="Відеобанер"/>}
   <div className="cx-profile-bar">
    <button aria-label="Редагувати профіль" onClick={()=>self?setEdit(true):onBack?.()}>{self?<Pencil size={22}/>:<ArrowLeft size={22}/>}</button>
    <div className="cx-profile-top-right">{self?<button aria-label="Налаштування" onClick={onSettings}><Settings size={23}/></button>:<button aria-label="Додати друга" onClick={()=>friendAction('POST',uid)} disabled={busy}><Users size={22}/></button>}<button aria-label="Оновити профіль" onClick={()=>void reload()}><RefreshCw size={19}/></button></div>
   </div>
   <div className="cx-profile-avatar" style={{borderColor:profile.accent}}><Avatar person={{...profile,photo_version:(profile.photo_version||0)+version}} size={164}/>{self&&<button className="cx-avatar-add" onClick={()=>document.dispatchEvent(new CustomEvent('cloux:open-editor',{detail:{kind:'avatar'}}))} aria-label="Змінити фото профілю"><Plus/></button>}</div>
  </div>
  <div className="cx-profile-details"><h1>{profile.display} <span title="Статус">{profile.status_icon}</span></h1><p className="cx-handle">@{profile.username}{profile.online&&<span className="cx-online"> · онлайн</span>}</p>
   {profile.bio&&<p className="cx-bio">{profile.bio}</p>}{profile.status&&<p className="cx-status">{profile.status}</p>}
   <button className="cx-friends-count" onClick={()=>{if(!profile.friends_visible){setError('Людина приховала список друзів.');return}setList(!list)}}><b>{profile.friends_count}</b> <span>Друзі</span> <ChevronRight size={18}/></button>
   {!self&&<div className="cx-profile-actions"><button className="cx-primary" onClick={()=>onMessage(uid)}>Написати</button>{profile.friendship==='friend'?<button disabled={busy} onClick={()=>void friendAction('DELETE',uid)}>Видалити з друзів</button>:profile.friendship==='outgoing'?<button disabled={busy} onClick={()=>void friendAction('DELETE',uid)}>Скасувати запит</button>:<button disabled={busy} onClick={()=>void friendAction('POST',uid)}>{profile.friendship==='incoming'?'Прийняти запит':'Додати в друзі'}</button>}</div>}
   {self&&<><div className="cx-profile-actions"><button className="cx-primary" onClick={()=>setEdit(true)}>Редагувати профіль</button><button onClick={onSettings}>Налаштування</button><button onClick={()=>document.dispatchEvent(new CustomEvent('cloux:open-editor',{detail:{kind:'banner'}}))}>Змінити банер</button></div>
    <div className="cx-profile-special"><label><Video size={17}/> Відеобанер MP4/WebM (до 14 МБ)<input type="file" accept="video/mp4,video/webm" hidden disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void uploadSpecial(f,'video')}}/></label><label><ImagePlus size={17}/> Анімований аватар GIF/WebP<input type="file" accept="image/gif,image/webp" hidden disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void uploadSpecial(f,'animated')}}/></label>{profile.banner_video&&<button onClick={async()=>{await request('/api/cloux/banner/video','DELETE');await reload()}}>Прибрати відеобанер</button>}</div></>}
   {!self&&profile.mutual.length>0&&<div className="cx-subsection"><h3>Спільні друзі · {profile.mutual.length}</h3><div className="cx-person-stack">{profile.mutual.map(u=><button key={u.id} onClick={()=>onOpenUser(u.id)}><Avatar person={u} size={39}/><span>{u.display}</span></button>)}</div></div>}
   {self&&requests.incoming.length>0&&<div className="cx-subsection"><h3>Запити в друзі · {requests.incoming.length}</h3>{requests.incoming.map(u=><div className="cx-person-row" key={u.id}><Avatar person={u}/><span><b>{u.display}</b><small>@{u.username}</small></span><button className="cx-primary" onClick={async()=>{await request('/api/cloux/friends/'+encodeURIComponent(u.id)+'/accept','POST');setVersion(v=>v+1);await reload()}}>Прийняти</button><button onClick={async()=>{await request('/api/cloux/friends/'+encodeURIComponent(u.id),'DELETE');setVersion(v=>v+1)}}>Відхилити</button></div>)}</div>}
   {list&&<div className="cx-subsection"><h3>Друзі {profile.display}</h3><div className="cx-search"><Search size={17}/><input aria-label="Пошук друзів" placeholder="Пошук друзів…" value={q} onChange={e=>setQ(e.target.value)}/><select aria-label="Сортування" value={sort} onChange={e=>setSort(e.target.value as 'name'|'online')}><option value="name">За ім’ям</option><option value="online">Онлайн</option></select></div>{friends.length?friends.map(u=><button className="cx-person-row" key={u.id} onClick={()=>onOpenUser(u.id)}><Avatar person={u}/><span><b>{u.display}</b><small>@{u.username} {u.online?'· онлайн':''}</small></span><ChevronRight size={18}/></button>):<p className="cx-muted">Друзів не знайдено.</p>}</div>}
   <RequestNotice message={error}/>
  </div>
  {edit&&<div className="cx-modal-shade"><div className="cx-edit-modal" role="dialog" aria-modal="true" aria-label="Редагування профілю"><header><h2>Редагування профілю</h2><button onClick={()=>setEdit(false)}><X/></button></header><label>Ім’я<input maxLength={48} value={name} onChange={e=>setName(e.target.value)}/></label><label>Позивний<input maxLength={24} value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Біо<textarea maxLength={180} value={bio} onChange={e=>setBio(e.target.value)} rows={3}/></label><label>Статус<input maxLength={80} value={status} onChange={e=>setStatus(e.target.value)}/></label><label>Значок статусу<input maxLength={8} value={icon} onChange={e=>setIcon(e.target.value)}/></label><div className="cx-inline-pickers"><label>Акцент<input type="color" value={accent} onChange={e=>setAccent(e.target.value)}/></label><label>Колір банера<input type="color" value={bannerColor} onChange={e=>setBannerColor(e.target.value)}/></label></div><button className="cx-primary" disabled={busy} onClick={()=>void save()}>{busy?'Зберігаємо…':'Зберегти на сервері'}</button><RequestNotice message={error}/></div></div>}
 </section>;
}

export function WallpaperStudio({chatId,onClose,onSaved}:{chatId?:string;onClose:()=>void;onSaved?:()=>void}){
 const [scope,setScope]=useState(chatId||'all'),[mode,setMode]=useState<'dark'|'light'>('dark'),[wall,setWall]=useState<Wallpaper>(defaultWall),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[file,setFile]=useState<File|null>(null),[imgVersion,setImgVersion]=useState(0);
 const load=()=>request<{wallpaper:Wallpaper|null}>('/api/cloux/wallpaper?scope='+encodeURIComponent(scope)+'&mode='+mode).then(r=>{setWall(r.wallpaper||defaultWall);setFile(null);setMessage('')}).catch(e=>setMessage(e.message));
 useEffect(()=>{void load()},[scope,mode]);
 const patch=(next:Partial<Wallpaper>)=>setWall(w=>({...w,...next}));
 const preview=useMemo(()=>file?{backgroundImage:'url('+URL.createObjectURL(file)+')',backgroundSize:'cover'}:wallpaperCSS(wall,scope,mode,wallpapers[0].style),[file,wall,scope,mode,imgVersion]);
 useEffect(()=>{if(file){const url=preview.backgroundImage?.match(/^url\((.+)\)$/)?.[1];return()=>{if(url?.startsWith('blob:'))URL.revokeObjectURL(url)}}},[file,preview]);
 const save=async()=>{setBusy(true);setMessage('');try{
  if(file){const res=await fetch('/api/cloux/wallpaper/media?scope='+encodeURIComponent(scope)+'&mode='+mode,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file});if(!res.ok)throw Error((await res.json().catch(()=>({}))).detail||'Фото не збережено');}
  const final={...wall,kind:file?'image':wall.kind};await request('/api/cloux/wallpaper?scope='+encodeURIComponent(scope)+'&mode='+mode,'PUT',final);
  setImgVersion(v=>v+1);setFile(null);setMessage('Шпалери збережено на сервері.');onSaved?.();
 }catch(e){setMessage(e instanceof Error?e.message:'Не вдалося зберегти')}finally{setBusy(false)}};
 return <div className="cx-wallpaper-studio"><header><button onClick={onClose} aria-label="Назад"><ArrowLeft/></button><h2>Шпалери чатів</h2></header>
  <div className="cx-wall-tabs">{chatId&&<button className={scope===chatId?'cx-selected':''} onClick={()=>setScope(chatId)}>Цей чат</button>}<button className={scope==='all'?'cx-selected':''} onClick={()=>setScope('all')}>Усі чати</button><button className={mode==='dark'?'cx-selected':''} onClick={()=>setMode('dark')}><Moon size={15}/> Темна</button><button className={mode==='light'?'cx-selected':''} onClick={()=>setMode('light')}><Sun size={15}/> Світла</button></div>
  <div className={'cx-wall-preview '+(wall.animate?'cx-wall-animated':'')} style={preview}><div className="cx-pattern" data-pattern={wall.pattern} style={{opacity:wall.intensity/100}}/><div className="cx-wall-dimmer" style={{background:'rgba(0,0,0,'+wall.dim/100+')',backdropFilter:'blur('+wall.blur+'px)'}}/><div className="cx-preview-messages"><div>Привіт! Як справи? <small>12:30</small></div><div>Привіт! Чудово ✨ <small>12:31 ✓✓</small></div></div></div>
  <h3>Колекція Cloux</h3><div className="cx-wall-presets">{wallpapers.map(w=><button key={w.id} className={wall.kind==='preset'&&wall.preset===w.id?'cx-selected':''} style={{backgroundImage:w.style}} aria-label={w.name} title={w.name} onClick={()=>{patch({kind:'preset',preset:w.id});setFile(null)}}/>)}</div>
  <h3>Власний градієнт</h3><div className="cx-wall-tabs">{[1,2,3,4].map(n=><button key={n} className={wall.colors.length===n?'cx-selected':''} onClick={()=>patch({kind:'gradient',colors:Array.from({length:n},(_,i)=>wall.colors[i]||['#e11d2e','#07080f','#64244b','#252b47'][i])})}>{n} {n===1?'колір':'кольори'}</button>)}</div><div className="cx-inline-pickers">{wall.colors.map((color,i)=><label key={i}>Колір {i+1}<input aria-label={'Колір '+(i+1)} type="color" value={color} onChange={e=>patch({kind:'gradient',colors:wall.colors.map((c,j)=>j===i?e.target.value:c)})}/></label>)}</div>
  <label className="cx-range">Кут градієнта · {wall.angle}°<input type="range" min="0" max="360" value={wall.angle} onChange={e=>patch({kind:'gradient',angle:+e.target.value})}/></label>
  <h3>Візерунок</h3><div className="cx-wall-tabs">{(['none','dots','lines','stars','grid'] as const).map(x=><button key={x} className={wall.pattern===x?'cx-selected':''} onClick={()=>patch({pattern:x})}>{({none:'Без',dots:'Точки',lines:'Лінії',stars:'Зорі',grid:'Сітка'} as Record<string,string>)[x]}</button>)}</div>
  <label className="cx-range">Інтенсивність · {wall.intensity}%<input type="range" min="0" max="100" value={wall.intensity} onChange={e=>patch({intensity:+e.target.value})}/></label>
  <label className="cx-range">Розмиття · {wall.blur}px<input type="range" min="0" max="24" value={wall.blur} onChange={e=>patch({blur:+e.target.value})}/></label>
  <label className="cx-range">Затемнення · {wall.dim}%<input type="range" min="0" max="75" value={wall.dim} onChange={e=>patch({dim:+e.target.value})}/></label>
  <label className="cx-check"><input type="checkbox" checked={wall.animate} onChange={e=>patch({animate:e.target.checked})}/> Анімований градієнт</label>
  <label className="cx-check"><input type="checkbox" checked={wall.parallax} onChange={e=>patch({parallax:e.target.checked})}/> Паралакс (за підтримки датчика нахилу)</label>
  <label className="cx-upload"><ImagePlus/> Фото з галереї<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f){if(f.size>5e6)setMessage('Фото має бути до 5 МБ');else{setFile(f);patch({kind:'image'});setMessage('')}}}} hidden/></label>
  <div className="cx-studio-actions"><button disabled={busy} className="cx-primary" onClick={()=>void save()}>{busy?'Зберігаємо…':'Застосувати шпалери'}</button><button disabled={busy} onClick={async()=>{await request('/api/cloux/wallpaper?scope='+encodeURIComponent(scope)+'&mode='+mode,'DELETE');await load();onSaved?.()}}>Скинути для цієї теми</button></div><RequestNotice message={message}/>
 </div>;
}

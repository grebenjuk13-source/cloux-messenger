import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,Archive,Check,ChevronRight,Cloud,Download,Globe,ImagePlus,Lock,Monitor,Moon,Palette,RefreshCw,Settings,Shield,Smile,Upload,Users,Volume2,X,MessageCircle} from 'lucide-react';
import {ProfileScreen,WallpaperStudio,type ClientUser} from './ClouxProduct';

type SettingsValue={friends_visibility:'all'|'friends'|'none';show_online:boolean;allow_requests:boolean;allow_calls:boolean;show_message_preview:boolean;notifications_messages:boolean;notifications_calls:boolean;notifications_sound:boolean;language:'uk';backup_interval:'off'|'daily'|'weekly';profile_accent:string;banner_gradient:string;status_icon:string;banner_video:boolean};
const initial:SettingsValue={friends_visibility:'all',show_online:true,allow_requests:true,allow_calls:true,show_message_preview:true,notifications_messages:true,notifications_calls:true,notifications_sound:true,language:'uk',backup_interval:'off',profile_accent:'#E11D2E',banner_gradient:'linear-gradient(120deg,#390c1b,#08090e)',status_icon:'✨',banner_video:false};
type Backup={id:number;created:number;bytes:number};
async function api<T>(url:string,method='GET',data?:unknown):Promise<T>{
 const r=await fetch(url,{method,credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 const body=await r.json().catch(()=>({}));if(!r.ok)throw Error(body.detail||'Помилка HTTP '+r.status);return body as T;
}
function jsonDownload(data:unknown,filename:string){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function BackupManager({onSchedule,interval}:{onSchedule:(v:'off'|'daily'|'weekly')=>void;interval:'off'|'daily'|'weekly'}){
 const [items,setItems]=useState<Backup[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const chooser=useRef<HTMLInputElement>(null);
 const refresh=()=>api<{backups:Backup[]}>('/api/cloux/backups').then(r=>setItems(r.backups)).catch(e=>setMessage(e.message));
 useEffect(()=>{void refresh()},[]);
 const run=async(action:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await action();await refresh()}catch(e){setMessage(e instanceof Error?e.message:'Помилка')}finally{setBusy(false)}};
 return <div className="cx-setting-content">
  <h3>Резервні копії CLOUX</h3>
  <p className="cx-setting-desc">Копія містить налаштування та історію чатів для експорту. Відновлення повертає налаштування й оформлення; повідомлення інших людей не переписуються.</p>
  <button className="cx-action" disabled={busy} onClick={()=>void run(async()=>{await api('/api/cloux/backups','POST');setMessage('Копію збережено на сервері')})}><Cloud size={18}/> Створити резервну копію</button>
  <button className="cx-action" disabled={busy} onClick={()=>void run(async()=>{const data=await api('/api/cloux/backups/export');jsonDownload(data,'Cloux-full-export.json');setMessage('Файл із приватними чатами збережено на пристрої')})}><Download size={18}/> Скачати повний експорт JSON</button>
  <label className="cx-action" style={{display:'flex',gap:10,cursor:'pointer',alignItems:'center'}}><Upload size={18}/> Відновити копію з файлу
   <input ref={chooser} hidden type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>12e6){setMessage('Файл завеликий');return}void run(async()=>{const data=JSON.parse(await file.text());const result=await api<{notice:string}>('/api/cloux/backups/restore','POST',{data});setMessage(result.notice)});e.currentTarget.value=''}}/>
  </label>
  <h3>Автоматичні копії</h3>
  <select value={interval} onChange={e=>onSchedule(e.target.value as 'off'|'daily'|'weekly')} aria-label="Розклад резервних копій"><option value="off">Вимкнено</option><option value="daily">Щодня</option><option value="weekly">Щотижня</option></select>
  <p className="cx-setting-desc">Розклад виконується сервером під час його роботи. На безкоштовному Render база даних тимчасова: завантажуй JSON на свій пристрій, щоб не залежати від перезапуску.</p>
  <h3>Збережені на сервері</h3>{items.length===0&&<p className="cx-muted">Резервних копій поки немає.</p>}
  {items.map(x=><div className="cx-person-row" key={x.id}><Cloud size={22}/><span><b>{new Date(x.created*1000).toLocaleString('uk-UA')}</b><small>{Math.round(x.bytes/1024)} КБ</small></span>
   <button disabled={busy} title="Завантажити" onClick={()=>void run(async()=>jsonDownload(await api('/api/cloux/backups/'+x.id),'Cloux-backup-'+x.id+'.json'))}><Download size={17}/></button>
   <button disabled={busy} onClick={()=>void run(async()=>{if(!confirm('Відновити оформлення й налаштування з цієї копії?'))return;const data=await api('/api/cloux/backups/'+x.id);const out=await api<{notice:string}>('/api/cloux/backups/restore','POST',{data});setMessage(out.notice)})}>Відновити</button>
   <button disabled={busy} onClick={()=>void run(async()=>{if(confirm('Видалити копію?'))await api('/api/cloux/backups/'+x.id,'DELETE')})}><X size={17}/></button></div>)}
  {message&&<p role="status" className="cx-notice">{message}</p>}
 </div>;
}
export function ProductSettings({me,onProfile,onBack,onLogout}:{me:ClientUser;onProfile:()=>void;onBack:()=>void;onLogout:()=>Promise<void>}){
 const [part,setPart]=useState(''),[values,setValues]=useState<SettingsValue>(initial),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[devices,setDevices]=useState<number|null>(null),[wallOpen,setWallOpen]=useState(false);
 const queued=useRef<Promise<unknown>>(Promise.resolve());
 useEffect(()=>{api<{settings:SettingsValue}>('/api/cloux/settings').then(r=>setValues({...initial,...r.settings})).catch(e=>setNotice(e.message)).finally(()=>setLoading(false))},[me.id]);
 const save=(change:Partial<SettingsValue>)=>{const updated={...values,...change};setValues(updated);queued.current=queued.current.catch(()=>{}).then(()=>api('/api/cloux/settings','PUT',updated)).catch(e=>setNotice('Не вдалося синхронізувати: '+e.message))};
 const toggle=(key:keyof SettingsValue,title:string)=> <label className="cx-setting-toggle"><span>{title}</span><input type="checkbox" checked={Boolean(values[key])} onChange={e=>save({[key]:e.target.checked})}/></label>;
 const row=(title:string,id:string,Icon:typeof Settings,detail='')=><button className="cx-setting-row" onClick={()=>setPart(id)} key={id}><Icon size={20}/><span><b>{title}</b>{detail&&<small>{detail}</small>}</span><ChevronRight size={18}/></button>;
 const sectionTitles:Record<string,string>={privacy:'Конфіденційність',notify:'Сповіщення',chats:'Чати й шпалери',data:'Дані та пам’ять',devices:'Пристрої',language:'Мова',theme:'Оформлення',tools:'Інструменти Cloux'};
 if(wallOpen)return <WallpaperStudio onClose={()=>setWallOpen(false)}/>;
 return <section className="cx-settings"><header><button aria-label="Назад" onClick={()=>part?setPart(''):onBack()}><ArrowLeft/></button><h1>{part?sectionTitles[part]:'Налаштування'}</h1><button aria-label="Відкрити профіль" onClick={onProfile}><Users/></button></header>
 {loading?<><div className="cx-skeleton cx-loading-block"/><div className="cx-skeleton cx-loading-block"/></>:!part?<div>
  <button className="cx-setting-row cx-setting-card" onClick={onProfile}><img className="cx-avatar" style={{width:64,height:64}} src={'/api/profile/'+encodeURIComponent(me.id)+'/media/avatar'} onError={e=>e.currentTarget.src='/assets/cloux-default-avatar.jpg'} alt="Аватар"/><span><b>{me.display}</b><small>@{me.username} · перейти до профілю</small></span><ChevronRight/></button>
  <div className="cx-settings-group"><h3>Акаунт</h3><div className="cx-setting-card">{row('Конфіденційність і безпека','privacy',Shield)}{row('Сповіщення','notify',Volume2)}{row('Пристрої','devices',Monitor)}</div></div>
  <div className="cx-settings-group"><h3>Зовнішній вигляд</h3><div className="cx-setting-card">{row('Чати й шпалери','chats',MessageCircle,'Окремі кольори для світлої й темної теми')}{row('Тема та кольори','theme',Palette,'Чорно-червоний, AMOLED та інші')}{row('Мова','language',Globe,'Українська')}</div></div>
  <div className="cx-settings-group"><h3>Дані</h3><div className="cx-setting-card">{row('Дані та пам’ять','data',Cloud,'Експорт, резервні копії та відновлення')}{row('Інструменти Cloux • стікери • резервна копія','tools',Smile)}</div></div>
  <button className="cx-action" onClick={()=>void onLogout()}>Вийти з акаунта</button>
 </div>:<div className="cx-setting-content">
 {part==='privacy'&&<><h3>Приватність</h3><label>Хто бачить мій список друзів<select value={values.friends_visibility} onChange={e=>save({friends_visibility:e.target.value as SettingsValue['friends_visibility']})}><option value="all">Усі користувачі</option><option value="friends">Лише друзі</option><option value="none">Ніхто</option></select></label>{toggle('show_online','Показувати, коли я онлайн')}{toggle('allow_requests','Дозволити запити в друзі')}{toggle('allow_calls','Дозволити вхідні дзвінки')}</>}
 {part==='notify'&&<><h3>Сповіщення CLOUX</h3>{toggle('notifications_messages','Нові повідомлення')}{toggle('notifications_calls','Дзвінки')}{toggle('notifications_sound','Звук сповіщень')}{toggle('show_message_preview','Показувати текст повідомлень')}<button className="cx-action" onClick={async()=>{if('Notification'in window){const state=await Notification.requestPermission();setNotice(state==='granted'?'Дозвіл надано':'Сповіщення заборонені або недоступні')}else setNotice('Цей браузер не підтримує системні сповіщення')}}>Дозволити системні сповіщення</button><p className="cx-setting-desc">Правила синхронізуються з акаунтом. Поведінка системних сповіщень залежить від браузера та налаштувань Android/iOS.</p></>}
 {part==='chats'&&<><h3>Шпалери</h3><button className="cx-action" onClick={()=>setWallOpen(true)}><ImagePlus size={20}/> Обрати шпалери для всіх чатів</button><p className="cx-setting-desc">Усередині кожного чату також є власний редактор шпалер.</p>{toggle('show_message_preview','Попередній перегляд повідомлень')}</>}
 {part==='theme'&&<><h3>Персоналізація</h3><button className="cx-action" onClick={()=>document.dispatchEvent(new CustomEvent('cloux:open-themes'))}><Palette size={20}/> Обрати дизайнерську тему CLOUX</button><p className="cx-setting-desc">Зміни застосовуються негайно. Теми зберігаються в профілі інтерфейсу.</p></>}
 {part==='devices'&&<><h3>Сеанси акаунта</h3><button className="cx-action" onClick={()=>api<{sessions:number}>('/api/devices').then(r=>setDevices(r.sessions)).catch(e=>setNotice(e.message))}><RefreshCw size={18}/> Перевірити сеанси</button>{devices!==null&&<p>Активних сеансів: {devices}</p>}<button className="cx-action" onClick={async()=>{if(!confirm('Завершити інші сеанси акаунта?'))return;try{await api('/api/devices/revoke-others','POST');setDevices(1);setNotice('Інші сеанси завершено')}catch(e){setNotice(e instanceof Error?e.message:'Помилка')}}}><Lock size={18}/> Завершити інші сеанси</button><p className="cx-setting-desc">Сервер наразі зберігає кількість сесій, без назв пристроїв.</p></>}
 {part==='language'&&<><h3>Мова</h3><button className="cx-action" onClick={()=>save({language:'uk'})}><Check size={18}/> 🇺🇦 Українська</button><p className="cx-setting-desc">Інші переклади CLOUX поки не випущені.</p></>}
 {part==='data'&&<BackupManager interval={values.backup_interval} onSchedule={backup_interval=>save({backup_interval})}/>}
 {part==='tools'&&<><h3>Інструменти та стікери</h3><button className="cx-action" onClick={()=>document.dispatchEvent(new CustomEvent('cloux:open-tools'))}><Smile size={18}/> Відкрити інструменти CLOUX</button><button className="cx-action" onClick={()=>setPart('data')}><Cloud size={18}/> Резервні копії</button></>}
 </div>}
 {notice&&<p className="cx-notice" role="status">{notice}</p>}
 </section>;
}

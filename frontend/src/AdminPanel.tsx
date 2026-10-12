import React,{useCallback,useEffect,useState} from 'react';
import {ShieldCheck,Users,Medal,Palette,ToggleRight,ScrollText,Megaphone,LockKeyhole,Check,RefreshCw} from 'lucide-react';
import './admin.css';

type Badge={id:string;name:string;icon:string;color:string;description:string};
type User={id:string;display:string;username:string;email?:string;email_verified:number;blocked:number;muted_until:number;badges:string[]};
type Theme={accent:string;background:string;surface:string;bubble:string;text:string};
type Overview={users:number;chats:number;messages:number;badges:Badge[];theme:Theme;features:Record<string,boolean>};
type Log={id:number;action:string;target:string;detail:string;created:number};
const LABELS:Record<string,string>={registration:'Реєстрація',calls:'Дзвінки',groups:'Групи',channels:'Канали',stickers:'Стікери',reactions:'Реакції',maintenance:'Обслуговування'};
const defaultTheme:Theme={accent:'#C8102E',background:'#0A0A0C',surface:'#16161A',bubble:'#A5122B',text:'#FFFFFF'};

async function adminApi<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const r=await fetch(path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j.detail||'Сервер відхилив дію');
 return j as T;
}
function errorText(e:unknown){return e instanceof Error?e.message:'Не вдалося виконати дію'}
export function OwnerVerification({onVerified}:{onVerified:()=>void}){
 const [code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ok,setOk]=useState('');
 async function send(){setBusy(true);setError('');try{await adminApi('/api/account/verify-email/send','POST',{});setSent(true);setOk('Код надіслано на вашу пошту. Він дійсний 10 хвилин.')}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 async function confirm(){setBusy(true);setError('');try{await adminApi('/api/account/verify-email/confirm','POST',{code});setOk('Адресу підтверджено.');onVerified()}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 return <section className="cloux-admin">
  <h3>Підтвердження електронної пошти</h3>
  <p>Пошта має бути підтверджена шестизначним кодом перед доступом до адміністративних налаштувань.</p>
  {!sent?<button className="admin-primary" onClick={()=>void send()} disabled={busy}>{busy?'Надсилаємо…':'Надіслати код'}</button>:
  <div className="admin-inline"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="6 цифр"/><button className="admin-primary" disabled={busy||code.length!==6} onClick={()=>void confirm()}>Підтвердити</button></div>}
  {sent&&<button className="admin-quiet" disabled={busy} onClick={()=>void send()}>Надіслати повторно</button>}
  {ok&&<p role="status">{ok}</p>}{error&&<p role="alert" className="admin-error">{error}</p>}
 </section>;
}
const tabs=[['overview','Огляд',ShieldCheck],['users','Користувачі',Users],['badges','Значки',Medal],['theme','Оформлення',Palette],['features','Функції',ToggleRight],['news','Новини',Megaphone],['logs','Журнал',ScrollText],['security','Захист',LockKeyhole]] as const;
type Tab=typeof tabs[number][0];

export default function AdminPanel(){
 const [tab,setTab]=useState<Tab>('overview'),[overview,setOverview]=useState<Overview|null>(null),[users,setUsers]=useState<User[]>([]),[logs,setLogs]=useState<Log[]>([]),[query,setQuery]=useState(''),[selected,setSelected]=useState<string>(''),[theme,setTheme]=useState<Theme>(defaultTheme),[post,setPost]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [newBadge,setNewBadge]=useState({id:'',name:'',icon:'star',color:'#FF6B7A',description:''});
 const [totpSecret,setTotpSecret]=useState(''),[totpCode,setTotpCode]=useState(''),[unlockCode,setUnlockCode]=useState('');
 const reload=useCallback(async()=>{const [stats,people,history]=await Promise.all([
   adminApi<Overview>('/api/admin/overview'),
   adminApi<{users:User[]}>('/api/admin/users?q='+encodeURIComponent(query)),
   adminApi<{logs:Log[]}>('/api/admin/audit')
 ]);setOverview(stats);setTheme(stats.theme);setUsers(people.users);setLogs(history.logs)},[query]);
 useEffect(()=>{void reload().catch(e=>setError(errorText(e)))},[reload]);
 const perform=async(fn:()=>Promise<unknown>,success='Збережено')=>{
  setBusy(true);setError('');setNotice('');
  try{await fn();setNotice(success);await reload()}catch(e){setError(errorText(e))}
  finally{setBusy(false)}
 };
 const edit=async(uid:string,data:Record<string,unknown>)=>perform(()=>adminApi('/api/admin/users/'+encodeURIComponent(uid),'PATCH',data));
 const active=users.find(u=>u.id===selected)||users[0];
 return <section className="cloux-admin" aria-label="Адмін-панель">
 <div className="admin-intro"><ShieldCheck color="#FF6B7A" size={27}/><div><h3>Адмін-панель</h3><p>Всі права перевіряються сервером. Приватні діалоги недоступні.</p></div><button className="admin-quiet" onClick={()=>void reload()} title="Оновити"><RefreshCw size={17}/></button></div>
 <nav className="admin-tabs" aria-label="Розділи адміністрування">{tabs.map(([id,label,Icon])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}><Icon size={16}/>{label}</button>)}</nav>
 {tab==='overview'&&overview&&<div className="admin-stats"><article><b>{overview.users}</b><small>Користувачів</small></article><article><b>{overview.chats}</b><small>Публічних чатів</small></article><article><b>{overview.messages}</b><small>Публічних повідомлень</small></article></div>}
 {tab==='users'&&<div className="admin-two-col"><div><label className="admin-label">Пошук користувача<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ім'я, нікнейм або email"/></label><div className="admin-user-list">{users.map(u=><button className={active?.id===u.id?'selected':''} key={u.id} onClick={()=>setSelected(u.id)}><b>{u.display}</b><small>@{u.username} {u.blocked?'· Заблоковано':''}</small></button>)}</div></div>
 <div>{active?<><h4>{active.display} <small>@{active.username}</small></h4><p>{active.email||'Email не додано'} {active.email_verified?<Check size={14} aria-label="Підтверджено"/>:''}</p><div className="admin-actions"><button disabled={busy} onClick={()=>{const v=prompt('Нове ім’я',active.display);if(v)void edit(active.id,{display:v})}}>Змінити ім’я</button><button disabled={busy} onClick={()=>{const v=prompt('Новий нікнейм',active.username);if(v)void edit(active.id,{username:v})}}>Змінити нікнейм</button><button disabled={busy} onClick={()=>void edit(active.id,{blocked:!active.blocked})}>{active.blocked?'Розблокувати':'Заблокувати'}</button><button disabled={busy} onClick={()=>void edit(active.id,{muted_minutes:active.muted_until>Date.now()/1000?0:60})}>{active.muted_until>Date.now()/1000?'Зняти мут':'Мут на 1 год'}</button><button disabled={busy} onClick={()=>{if(confirm('Завершити всі сесії цього користувача?'))void perform(()=>adminApi('/api/admin/users/'+encodeURIComponent(active.id)+'/logout-all','POST',{}))}}>Скинути всі сесії</button></div><h4>Значки користувача</h4><div className="admin-badge-list">{overview?.badges.map(b=><label key={b.id} className="admin-badge"><span style={{color:b.color}}>◆</span><span>{b.name}</span><input type="checkbox" checked={active.badges.includes(b.id)} disabled={busy} onChange={e=>void perform(()=>adminApi('/api/admin/users/'+encodeURIComponent(active.id)+'/badges/'+encodeURIComponent(b.id),'PUT',{enabled:e.target.checked}))}/></label>)}</div></>:<p>Немає результатів.</p>}</div></div>}
 {tab==='badges'&&<div><h4>Доступні значки</h4><div className="admin-badge-list">{overview?.badges.map(b=><div className="admin-badge" key={b.id}><span style={{color:b.color}}>◆</span><b>{b.name}</b><small>{b.description}</small></div>)}</div><h4>Новий значок</h4><div className="admin-grid">{(Object.keys(newBadge) as (keyof typeof newBadge)[]).map(k=><label key={k} className="admin-label">{({id:'ID латиницею',name:'Назва',icon:'Іконка (назва)',color:'Колір',description:'Опис'} as Record<string,string>)[k]}<input type={k==='color'?'color':'text'} value={newBadge[k]} onChange={e=>setNewBadge({...newBadge,[k]:e.target.value})}/></label>)}</div><button className="admin-primary" disabled={busy} onClick={()=>void perform(()=>adminApi('/api/admin/badges','POST',newBadge),'Значок створено')}>Створити значок</button></div>}
 {tab==='theme'&&<div><p>Глобальна палітра синхронізується для всіх клієнтів Cloux.</p><div className="admin-theme-preview" style={{background:theme.background,color:theme.text,borderColor:theme.accent}}><b>Cloux.</b><span style={{background:theme.bubble,color:theme.text}}>Повідомлення · 12:34 ✓✓</span></div><div className="admin-grid">{(Object.keys(defaultTheme) as (keyof Theme)[]).map(k=><label className="admin-label" key={k}>{({accent:'Акцент',background:'Фон',surface:'Панелі',bubble:'Мої повідомлення',text:'Текст'} as Record<string,string>)[k]}<div className="admin-color"><input type="color" value={theme[k]} onChange={e=>setTheme({...theme,[k]:e.target.value})}/><code>{theme[k]}</code></div></label>)}</div><div className="admin-actions"><button onClick={()=>setTheme(defaultTheme)}>Скинути</button><button className="admin-primary" disabled={busy} onClick={()=>void perform(()=>adminApi('/api/admin/theme','PUT',theme),'Тему оновлено')}>Зберегти для всіх</button></div></div>}
 {tab==='features'&&<div className="admin-badge-list">{Object.entries(overview?.features||{}).map(([name,enabled])=><label className="admin-badge" key={name}><b>{LABELS[name]||name}</b><input type="checkbox" checked={enabled} disabled={busy} onChange={e=>void perform(()=>adminApi('/api/admin/features/'+name,'PUT',{enabled:e.target.checked}))}/></label>)}</div>}
 {tab==='news'&&<div><h4>Пост у «Новини Cloux»</h4><textarea rows={5} maxLength={4000} value={post} onChange={e=>setPost(e.target.value)} placeholder="Текст оголошення всім підписникам"/><button className="admin-primary" disabled={busy||post.trim().length<2} onClick={()=>void perform(async()=>{await adminApi('/api/admin/announcements','POST',{text:post});setPost('')},'Опубліковано')}>Опублікувати</button></div>}
 {tab==='logs'&&<div className="admin-log">{logs.map(l=><article key={l.id}><b>{l.action}</b><small>{l.target} · {new Date(l.created*1000).toLocaleString('uk-UA')}</small></article>)}{!logs.length&&<p>Дій поки немає.</p>}</div>}
 {tab==='security'&&<div><h4>Двофакторний захист (TOTP)</h4><p>Під’єднайте додаток-автентифікатор. Не надсилайте коди нікому.</p><button onClick={()=>{const password=prompt('Введіть пароль Cloux для налаштування TOTP');if(password)void perform(async()=>{const x=await adminApi<{secret:string}>('/api/admin/totp/start','POST',{password});setTotpSecret(x.secret)},'Секрет створено. Збережіть його в додатку-автентифікаторі.')}}>Налаштувати TOTP</button>{totpSecret&&<div><p>Секрет (збережіть конфіденційно): <code>{totpSecret}</code></p><div className="admin-inline"><input inputMode="numeric" maxLength={6} value={totpCode} placeholder="Код підтвердження" onChange={e=>setTotpCode(e.target.value.replace(/\D/g,''))}/><button className="admin-primary" onClick={()=>void perform(()=>adminApi('/api/admin/totp/enable','POST',{code:totpCode}))}>Увімкнути</button></div></div>}<h4>Розблокувати зміни на 15 хвилин</h4><div className="admin-inline"><input inputMode="numeric" maxLength={6} placeholder="TOTP код" value={unlockCode} onChange={e=>setUnlockCode(e.target.value.replace(/\D/g,''))}/><button disabled={unlockCode.length!==6} onClick={()=>void perform(()=>adminApi('/api/admin/totp/unlock','POST',{code:unlockCode}))}>Підтвердити</button></div></div>}
 {notice&&<p role="status" className="admin-notice">{notice}</p>}{error&&<p role="alert" className="admin-error">{error}</p>}
 </section>;
}

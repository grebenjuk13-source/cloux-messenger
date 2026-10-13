import React,{useEffect,useState} from 'react';
import {BadgeCheck,Gift,Search,ShieldCheck,Check,X} from 'lucide-react';
import './cloux-identity.css';

type Person={id:string;display:string;username:string;verified:number};
type GiftModel={id:number;emoji:string;sender_display:string;sender_username:string;item:string;note:string;created:number};
type Catalog={id:string;emoji:string;name:string}[];
async function api<T>(url:string,method='GET',body?:unknown):Promise<T>{
 const r=await fetch(url,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.detail||'Помилка '+r.status);return data as T;
}
export function VerifiedMark({uid}:{uid:string}){
 const [verified,setVerified]=useState(false);
 useEffect(()=>{let live=true;api<{verified:boolean}>('/api/cloux/badges/'+encodeURIComponent(uid)).then(x=>{if(live)setVerified(x.verified)}).catch(()=>{});return()=>{live=false}},[uid]);
 return verified?<BadgeCheck size={21} className="cx-verified-mark" aria-label="Підтверджений профіль CLOUX"/>:null;
}
export function AdminPanel(){
 const [people,setPeople]=useState<Person[]>([]),[q,setQ]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const reload=()=>api<{users:Person[]}>('/api/cloux/admin/users?q='+encodeURIComponent(q)).then(x=>setPeople(x.users)).catch(e=>setError(e.message));
 useEffect(()=>{const timer=setTimeout(reload,240);return()=>clearTimeout(timer)},[q]);
 const grant=async(person:Person)=>{setBusy(person.id);setError('');try{await api('/api/cloux/admin/users/'+encodeURIComponent(person.id)+'/verification','PUT',{verified:!person.verified});await reload()}catch(e){setError(e instanceof Error?e.message:'Невідома помилка')}finally{setBusy('')}};
 return <div className="cx-admin-panel"><h3><ShieldCheck size={23}/> Адмін-панель CLOUX</h3><p>Галочки підтверджених профілів. Усі зміни зберігаються на сервері.</p><label className="cx-admin-search"><Search size={18}/><input placeholder="Пошук ніка або імені" value={q} onChange={e=>setQ(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}
  <div className="cx-admin-users">{people.map(person=><div className="cx-admin-user" key={person.id}><div className="cx-admin-letter">{person.display.slice(0,1).toUpperCase()}</div><span><b>{person.display} {person.verified?<BadgeCheck size={17} className="cx-verified-mark"/>:null}</b><small>@{person.username}</small></span><button disabled={busy===person.id} onClick={()=>void grant(person)} className={person.verified?'cx-unverify':'cx-verify'}>{person.verified?<><X size={16}/> Зняти</>:<><Check size={16}/> Дати галочку</>}</button></div>)}</div>
 </div>;
}
export function GiftGallery({uid,self,isFriend}:{uid:string;self:boolean;isFriend:boolean}){
 const [gifts,setGifts]=useState<GiftModel[]>([]),[catalog,setCatalog]=useState<Catalog>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[note,setNote]=useState('');
 const refresh=()=>api<{gifts:GiftModel[]}>('/api/cloux/gifts/'+encodeURIComponent(uid)).then(x=>setGifts(x.gifts)).catch(()=>{});
 useEffect(()=>{void refresh();void api<{gifts:Catalog}>('/api/cloux/gifts/catalog').then(x=>setCatalog(x.gifts)).catch(()=>{})},[uid]);
 const send=async(item:string)=>{setBusy(true);setMessage('');try{await api('/api/cloux/gifts/send','POST',{recipient_id:uid,gift_id:item,note});setOpen(false);setNote('');await refresh();setMessage('Подарунок надіслано 🎁')}catch(e){setMessage(e instanceof Error?e.message:'Не вдалося надіслати подарунок')}finally{setBusy(false)}};
 return <section className="cx-gift-gallery"><div className="cx-gift-header"><h3><Gift size={20}/> Подарунки <span>{gifts.length}</span></h3>{!self&&isFriend&&<button onClick={()=>setOpen(v=>!v)}>{open?'Закрити':'🎁 Надіслати'}</button>}</div>
 {message&&<p className="cx-gift-notice" role="status">{message}</p>}
 {open&&<div className="cx-gift-catalog"><label>Побажання (необов’язково)<input maxLength={100} value={note} onChange={e=>setNote(e.target.value)} placeholder="Теплі слова"/></label><div>{catalog.map(item=><button disabled={busy} key={item.id} onClick={()=>void send(item.id)}><span>{item.emoji}</span><small>{item.name}</small></button>)}</div></div>}
 {gifts.length?<div className="cx-gift-grid">{gifts.map(g=><article className="cx-gift-card" key={g.id}><span>{g.emoji}</span><b>{catalog.find(x=>x.id===g.item)?.name||'Подарунок'}</b><small>від @{g.sender_username}</small>{g.note&&<p>{g.note}</p>}</article>)}</div>:<div className="cx-gift-empty"><Gift size={27}/><span>Подарунків поки немає</span></div>}
 </section>;
}

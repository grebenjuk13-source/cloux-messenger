import React,{useEffect,useRef,useState} from 'react';
import {Bell,ChevronLeft,ChevronRight,Flame,Plus,Search,Trophy,Users,X,Send,Trash2,Check} from 'lucide-react';
import {formatDate,formatNumber,useI18n} from './i18n';
import './cloux-community.css';

type Rank={id:string;display:string;username:string;friends:number;streak:number;rank:number;reached:number;badge:string};
type Ranking={rows:Rank[];me:Rank|null;total:number;sort:string};
type Story={id:number;uid:string;username:string;display:string;text:string;background:string;created:number;expires:number;viewed:number};
type EventRow={id:number;kind:string;actor_display:string;actor_username:string;actor_id:string;ref:string;created:number};
type FriendRequest={id:string;display:string;username:string;created:number};
type Api<T>=Promise<T>;
async function call<T>(url:string,method='GET',body?:unknown):Api<T>{
 const r=await fetch(url,{method,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.detail||'HTTP '+r.status);
 return data as T;
}
const vibrate=(duration=9)=>{try{if('vibrate'in navigator)navigator.vibrate(duration)}catch{}};
export function TopFriends({me,onOpenUser}:{me:{id:string};onOpenUser:(id:string)=>void}){
 const {t}=useI18n();
 const [mode,setMode]=useState<'friends'|'streak'>('friends'),[data,setData]=useState<Ranking|null>(null),[error,setError]=useState(''),[animate,setAnimate]=useState(false);
 const old=useRef<number|null>(null);
 const reload=()=>call<Ranking>('/api/cloux/top?sort='+mode+'&limit_count=100').then(next=>{
  if(mode==='friends'&&next.me){
   try{
    const key='cloux:rank:'+me.id;
    const previous=Number(localStorage.getItem(key)||0);
    if(previous>0&&next.me.rank>previous){window.dispatchEvent(new CustomEvent('cloux:rank-passed',{detail:{rank:next.me.rank}}));vibrate(17)}
    localStorage.setItem(key,String(next.me.rank));
   }catch{}
  }
  old.current=next.me?.rank??null;setData(next);setAnimate(true);setError('');
 }).catch(e=>setError(e instanceof Error?e.message:t('noConnection')));
 useEffect(()=>{void reload();const onFocus=()=>void reload();window.addEventListener('focus',onFocus);document.addEventListener('cloux:friends-changed',onFocus);return()=>{window.removeEventListener('focus',onFocus);document.removeEventListener('cloux:friends-changed',onFocus)}},[mode,me.id]);
 const rows=data?.rows||[],top=rows.slice(0,3),remaining=rows.slice(3,20);
 const badge=(row:Rank)=>(['rookie','social','veteran','century','legend'] as const).includes(row.badge as any)?t(row.badge as 'rookie'|'social'|'veteran'|'century'|'legend'):row.badge;
 const person=(x:Rank,position?:string)=> <button key={x.id} className={'cx-rank-card '+(x.id===me.id?'cx-is-me':'')} onClick={()=>onOpenUser(x.id)}>
  <span className="cx-rank-pos">{position||formatNumber(x.rank)}</span><span className="cx-rank-photo">{x.display.trim().slice(0,1).toLocaleUpperCase()}</span>
  <span className="cx-rank-identity"><b>{x.display}</b><small>@{x.username} <i>{badge(x)}</i></small></span>
  <span className="cx-rank-score">{formatNumber(mode==='friends'?x.friends:x.streak)}{mode==='streak'?<Flame size={16}/>:<Users size={16}/>}</span>
 </button>;
 return <section className="cx-ranking-page"><header className="cx-rank-header"><Trophy size={25}/><h2>{t('top')}</h2></header>
  <div className="cx-rank-tabs" role="tablist">
   <button role="tab" aria-selected={mode==='friends'} className={mode==='friends'?'selected':''} onClick={()=>{setAnimate(false);setMode('friends')}}><Users size={17}/>{t('countTop')}</button>
   <button role="tab" aria-selected={mode==='streak'} className={mode==='streak'?'selected':''} onClick={()=>{setAnimate(false);setMode('streak')}}><Flame size={17}/>{t('fireTop')}</button>
  </div>
  {error&&<p className="cx-notice" role="alert">{error}</p>}
  {!data?<div className="cx-rank-skeleton" aria-label={t('preview')}/>:<>
   <div className="cx-podium">{[top[1],top[0],top[2]].filter(Boolean).map((x,i)=><div className={'cx-podium-slot level-'+x.rank} key={x.id}>{person(x)}<div className="cx-podium-pillar"><b>{formatNumber(x.rank)}</b></div></div>)}</div>
   <h3>{t('leaderboard')}</h3><div className="cx-rank-list">{remaining.map((r,i)=><div className="cx-rank-appear" style={{animationDelay:Math.min(7,i)*35+'ms'}} key={r.id}>{person(r)}</div>)}</div>
   {data.me&&<div className="cx-my-rank"><span>{t('yourPlace')}</span>{person(data.me)}</div>}
  </>}
 </section>
}
const palettes:Record<string,string>={ink:'linear-gradient(145deg,#070708,#27262b)',ruby:'linear-gradient(132deg,#e10600,#4b1217 68%,#080708)',merlot:'linear-gradient(150deg,#3b0b1b,#080609)',mist:'linear-gradient(135deg,#191922,#45475c)',silver:'linear-gradient(145deg,#090a0d,#4b4d58)'};
export function Stories({me}:{me:{id:string;display:string}}){
 const {t}=useI18n();
 const [items,setItems]=useState<Story[]>([]),[idx,setIdx]=useState<number|null>(null),[editor,setEditor]=useState(false),[storyText,setStoryText]=useState(''),[background,setBackground]=useState('ink'),[error,setError]=useState('');
 const touch=useRef(0);
 const refresh=()=>call<{stories:Story[]}>('/api/cloux/stories').then(r=>setItems(r.stories)).catch(()=>{});
 useEffect(()=>{void refresh();const i=window.setInterval(refresh,60000);return()=>clearInterval(i)},[me.id]);
 const profiles=[...new Set(items.map(x=>x.uid))];
 const storiesByUser=profiles.map(uid=>{const owned=items.filter(x=>x.uid===uid).sort((a,b)=>a.created-b.created);return {uid,display:owned[0]?.display||me.display,stories:owned,unread:owned.some(x=>!x.viewed)}});
 const open=(uid:string)=>{const position=items.findIndex(x=>x.uid===uid);if(position<0)return;setIdx(position);void mark(items[position])};
 const mark=(item:Story)=>{if(item.uid!==me.id&&!item.viewed){void call('/api/cloux/stories/'+item.id+'/seen','POST').then(refresh).catch(()=>{})}};
 const go=(n:number)=>{const next=(idx||0)+n;if(next<0||next>=items.length){setIdx(null);return}setIdx(next);void mark(items[next])};
 const create=async()=>{if(!storyText.trim())return;try{await call('/api/cloux/stories','POST',{text:storyText.trim(),background});setStoryText('');setEditor(false);await refresh();vibrate()}catch(e){setError(e instanceof Error?e.message:t('noConnection'))}};
 return <><div className="cx-stories-strip" aria-label={t('stories')}>
  <button className="cx-story-person cx-new-story" onClick={()=>setEditor(true)}><span className="cx-story-ring"><span className="cx-story-avatar"><Plus size={25}/></span></span><small>{t('yourStory')}</small></button>
  {storiesByUser.map(row=><button className="cx-story-person" key={row.uid} onClick={()=>open(row.uid)}><span className={'cx-story-ring '+(row.unread?'unread':'read')}><span className="cx-story-avatar">{row.display.trim().slice(0,1).toLocaleUpperCase()}</span></span><small>{row.uid===me.id?t('yourStory'):row.display}</small></button>)}
 </div>
 {editor&&<div className="cx-story-overlay"><section className="cx-story-editor"><button className="cx-story-exit" onClick={()=>setEditor(false)} aria-label={t('close')}><X/></button><h2>{t('addStory')}</h2><div className="cx-story-preview" style={{backgroundImage:palettes[background]}}><textarea autoFocus maxLength={240} value={storyText} onChange={e=>setStoryText(e.target.value)} placeholder={t('message')}/></div><div className="cx-story-colors">{Object.entries(palettes).map(([id,grad])=><button key={id} className={background===id?'active':''} style={{backgroundImage:grad}} onClick={()=>setBackground(id)} aria-label={id}/>)}</div><button className="cx-story-send" onClick={()=>void create()} disabled={!storyText.trim()}><Send size={17}/>{t('send')}</button>{error&&<p role="alert">{error}</p>}</section></div>}
 {idx!==null&&items[idx]&&<div className="cx-story-overlay" onTouchStart={e=>touch.current=e.touches[0].clientX} onTouchEnd={e=>{const delta=e.changedTouches[0].clientX-touch.current;if(Math.abs(delta)>55)go(delta<0?1:-1)}}>
  <div className="cx-story-view" style={{backgroundImage:palettes[items[idx].background]||palettes.ink}}>
   <div className="cx-story-progress">{items.map((item,i)=><span key={item.id} className={i<=idx?'active':''}/>)}</div>
   <div className="cx-story-head"><b>{items[idx].display}</b><small>{formatDate(items[idx].created)}</small><button onClick={()=>setIdx(null)} aria-label={t('close')}><X/></button></div>
   <div className="cx-story-actual">{items[idx].text}</div>
   <div className="cx-story-controls"><button onClick={()=>go(-1)} aria-label="Previous"><ChevronLeft/></button>{items[idx].uid===me.id&&<button onClick={async()=>{await call('/api/cloux/stories/'+items[idx].id,'DELETE');setIdx(null);await refresh()}}><Trash2/></button>}<button onClick={()=>go(1)} aria-label="Next"><ChevronRight/></button></div>
  </div>
 </div>}
 </>;
}
export function NotificationCenter({me,onOpenUser}:{me:{id:string};onOpenUser:(id:string)=>void}){
 const {t}=useI18n();
 const [open,setOpen]=useState(false),[feed,setFeed]=useState<EventRow[]>([]),[requests,setRequests]=useState<FriendRequest[]>([]),[notice,setNotice]=useState(''),[unread,setUnread]=useState(0),[rankEvents,setRankEvents]=useState<number[]>([]);
 const reload=()=>call<{events:EventRow[];requests:FriendRequest[];unread_count:number}>('/api/cloux/notifications').then(x=>{setFeed(x.events);setRequests(x.requests);setUnread(x.unread_count||0)}).catch(e=>setNotice(e.message));
 useEffect(()=>{void reload();const i=window.setInterval(reload,30000);const update=(e:Event)=>{setRankEvents(v=>[(e as CustomEvent<{rank:number}>).detail.rank,...v].slice(0,5));void reload()};window.addEventListener('cloux:rank-passed',update);document.addEventListener('cloux:friends-changed',reload);return()=>{window.clearInterval(i);window.removeEventListener('cloux:rank-passed',update);document.removeEventListener('cloux:friends-changed',reload)}},[me.id]);
 const badge=unread+requests.length;
 const accept=async(uid:string)=>{try{await call('/api/cloux/friends/'+uid+'/accept','POST');vibrate();document.dispatchEvent(new Event('cloux:friends-changed'));await reload()}catch(e){setNotice(e instanceof Error?e.message:t('noConnection'))}};
 return <><button className="cx-bell-button" aria-label={t('notificationCenter')} onClick={()=>{setOpen(true);setUnread(0);void call('/api/cloux/notifications/read','POST').then(reload).catch(()=>reload())}}><Bell size={22}/>{badge>0&&<span className="cx-bell-badge">{badge>99?'99+':badge}</span>}</button>
 {open&&<div className="cx-notification-overlay" onClick={()=>setOpen(false)}><section className="cx-notification-sheet" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('notificationCenter')}><header><h2>{t('notificationCenter')}</h2><button onClick={()=>setOpen(false)} aria-label={t('close')}><X/></button></header>
  {notice&&<p role="alert">{notice}</p>}
  {rankEvents.map((rank,i)=><article className="cx-notice-item" key={'rank'+i}><Trophy/><span><b>{t('rankingUp')}</b><small>{t('yourPlace')}: {formatNumber(rank)}</small></span></article>)}
  {requests.map(x=><article className="cx-notice-item" key={'req'+x.id}><Users/><span><b>{t('friendRequest')}</b><small>{x.display} · @{x.username}</small></span><button onClick={()=>void accept(x.id)}><Check size={18}/></button></article>)}
  {feed.filter(x=>x.kind!=='request').map(x=><button className="cx-notice-item" key={x.id} onClick={()=>{if(x.actor_id){setOpen(false);onOpenUser(x.actor_id)}}}><span className="cx-notice-icon">{x.kind==='reaction'?'❤️':'👤'}</span><span><b>{x.kind==='reaction'?t('reaction'):t('newFriend')}</b><small>{x.actor_display} · {formatDate(x.created)}</small></span><ChevronRight size={16}/></button>)}
  {!rankEvents.length&&!requests.length&&!feed.filter(x=>x.kind!=='request').length&&<div className="cx-empty-notifications"><Bell size={32}/>{t('noNotifications')}</div>}
 </section></div>}
 </>;
}

import React,{useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Image,Mic,Send,Smile,Volume2,X} from 'lucide-react';
import {formatDate,useI18n} from './i18n';
import './cloux-demo.css';

type Entry={id:number;sender:'me'|'demo';text:string;at:number;reaction?:string;kind?:'voice'|'art'};
type Demo={id:string;emoji:string;title:string;wall:string;messages:Entry[]};
const BASE:Demo[]=[
 {id:'intro',emoji:'☁️',title:'CLOUX · Hello',wall:'linear-gradient(145deg,#09090d,#2a111d,#070708)',messages:[
  {id:1,sender:'demo',text:'Привіт! ☁️ Це приклад розмови в CLOUX.',at:1},
  {id:2,sender:'me',text:'Класно, тут є реакції! ❤️',at:2,reaction:'❤️'},
  {id:3,sender:'demo',text:'Спробуй написати щось у відповідь ✨',at:3}]},
 {id:'media',emoji:'🎨',title:'CLOUX · Media',wall:'linear-gradient(145deg,#23141c,#292e46,#060609)',messages:[
  {id:1,sender:'demo',text:'Наш авторський фон 🎨',at:1,kind:'art'},
  {id:2,sender:'me',text:'Гарно виглядає!',at:2},
  {id:3,sender:'demo',text:'Натисни на голосове, щоб прослухати.',at:3,kind:'voice'}]},
 {id:'fire',emoji:'🔥',title:'CLOUX · Friends',wall:'linear-gradient(155deg,#080809,#4a1622,#17131b)',messages:[
  {id:1,sender:'demo',text:'Сьогодні наша серія листування — 3 дні! 🔥',at:1},
  {id:2,sender:'me',text:'Завтра продовжимо? 🙂',at:2},
  {id:3,sender:'demo',text:'Звісно! 🚀',at:3,reaction:'🔥'}]}
];
function getState(userId:string):Record<string,Entry[]>{
 try{const v=JSON.parse(localStorage.getItem('cloux:demo:'+userId)||'{}');return typeof v==='object'&&v?Object.fromEntries(BASE.map(d=>[d.id,Array.isArray(v[d.id])?v[d.id]:d.messages])):Object.fromEntries(BASE.map(d=>[d.id,d.messages]))}catch{return Object.fromEntries(BASE.map(d=>[d.id,d.messages]))}
}
export function DemoChats({accountId}:{accountId:string}){
 const {t,locale}=useI18n();
 const [current,setCurrent]=useState<string|null>(null),[history,setHistory]=useState<Record<string,Entry[]>>(()=>getState(accountId)),[draft,setDraft]=useState('');
 useEffect(()=>{setHistory(getState(accountId))},[accountId]);
 const details=BASE.find(x=>x.id===current);
 const messages=useMemo(()=>history[current||'']||[],[current,history]);
 const update=(items:Entry[])=>setHistory(old=>{const next={...old,[current||'']:items};try{localStorage.setItem('cloux:demo:'+accountId,JSON.stringify(next))}catch{}return next});
 const send=()=>{if(!draft.trim()||!details)return;update([...messages,{id:Date.now(),sender:'me',text:draft.trim(),at:Date.now()/1000}]);setDraft('');try{navigator.vibrate?.(9)}catch{}};
 const play=()=>{if(!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const phrase=new SpeechSynthesisUtterance(locale==='uk'?'Це демонстрація голосового повідомлення у Cloux.':'This is a sample voice message in Cloux.');phrase.lang=locale;window.speechSynthesis.speak(phrase)};
 return <><section className="cx-demo-list"><header><b>{t('preview')} · CLOUX</b><small>{t('leaderboard').slice(0,0)}</small></header>
  <div>{BASE.map(x=><button key={x.id} className="cx-demo-card" onClick={()=>setCurrent(x.id)}><span>{x.emoji}</span><span><b>{x.title}</b><small>{t('message')} · {t('preview')}</small></span><span>›</span></button>)}</div>
 </section>
 {current&&details&&<div className="cx-demo-overlay"><div className="cx-demo-chat">
  <header className="cx-demo-header"><button aria-label={t('close')} onClick={()=>{setCurrent(null);window.speechSynthesis?.cancel()}}><ArrowLeft/></button><span className="cx-demo-icon">{details.emoji}</span><span><b>{details.title}</b><small>{t('preview')} · CLOUX</small></span><button onClick={()=>{setCurrent(null);window.speechSynthesis?.cancel()}} aria-label={t('close')}><X/></button></header>
  <div className="cx-demo-messages" style={{backgroundImage:details.wall}}><span className="cx-demo-date">{t('today')}</span>{messages.map(m=><div className={'cx-demo-bubble '+(m.sender==='me'?'out':'in')} key={m.id}>
   {m.kind==='art'&&<div className="cx-demo-art"><span>Cloux.</span><span>LIQUID / RED</span></div>}
   {m.text}
   {m.kind==='voice'&&<button className="cx-demo-voice" onClick={play}><Volume2 size={18}/><span>▂ ▆ ▃ █ ▄ ▆ ▂ ▄ █ ▆</span></button>}
   <small>{m.at<10000?'12:'+String(20+m.at).padStart(2,'0'):formatDate(m.at,{hour:'2-digit',minute:'2-digit'})}</small>
   {m.reaction&&<span className="cx-demo-react">{m.reaction}</span>}
   <button aria-label={t('reaction')} onClick={()=>update(messages.map(x=>x.id===m.id?{...x,reaction:x.reaction?'':'❤️'}:x))}><Smile size={15}/></button>
  </div>)}</div>
  <form className="cx-demo-compose" onSubmit={e=>{e.preventDefault();send()}}><input aria-label={t('writeMessage')} placeholder={t('writeMessage')} value={draft} onChange={e=>setDraft(e.target.value)}/><button disabled={!draft.trim()} type="submit" aria-label={t('send')}><Send size={19}/></button></form>
  </div></div>}
 </>;
}

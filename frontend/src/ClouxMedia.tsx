import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ExternalLink,Headphones,Link2} from 'lucide-react';

/** Link cards are generated from the URL itself. We do not impersonate a page title or fetch untrusted OpenGraph servers. */
export function LinkCards({text}:{text:string}){
 const links=useMemo(()=>{
  const found=text.match(/https?:\/\/[^\s<>"'()]+/gi)||[];
  const urls:string[]=[];
  for(const value of found.slice(0,5)){
   try{const u=new URL(value.replace(/[.,!?;:]$/,''));if(['https:','http:'].includes(u.protocol)&&u.hostname&&u.hostname.length<255&&!urls.includes(u.href))urls.push(u.href)}catch{}
  }
  return urls;
 },[text]);
 if(!links.length)return null;
 return <div className="cx-link-cards">{links.map(href=>{
  const u=new URL(href);
  return <a className="cx-link-card" href={href} target="_blank" rel="noopener noreferrer" key={href} onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} aria-label={'Відкрити посилання '+u.hostname}>
   <span className="cx-link-icon"><Link2 size={18}/></span><span className="cx-link-info"><b>{u.hostname.replace(/^www\./,'')}</b><small>{u.pathname==='/'?u.origin:(u.pathname+u.search).slice(0,85)}</small></span><ExternalLink size={15}/>
  </a>})}</div>;
}
function samples(buffer:AudioBuffer,count=44){
 const arr=buffer.getChannelData(0);if(!arr.length)return [];
 const data:number[]=[];const size=Math.max(1,Math.floor(arr.length/count));
 for(let i=0;i<count;i++){
  let max=0,mean=0;
  for(let j=i*size;j<Math.min(arr.length,(i+1)*size);j+=Math.max(1,Math.round(size/95))){
   const a=Math.abs(arr[j]);if(a>max)max=a;mean+=a;
  }
  data.push(Math.max(3,Math.min(100,Math.sqrt(max)*100)));
 }
 return data;
}
export function AudioBubble({src}:{src:string}){
 const [peaks,setPeaks]=useState<number[]>([]),[busy,setBusy]=useState(false);
 const ref=useRef<HTMLAudioElement>(null);
 useEffect(()=>{
  let cancelled=false;
  const process=async()=>{
   if(!('AudioContext'in window))return;
   setBusy(true);
   let ctx:AudioContext|null=null;
   try{
    const r=await fetch(src,{credentials:'same-origin'});if(!r.ok||Number(r.headers.get('Content-Length')||0)>6e6)return;
    const bytes=await r.arrayBuffer();
    if(bytes.byteLength>6e6)return;
    ctx=new AudioContext();
    const buffer=await ctx.decodeAudioData(bytes);
    if(!cancelled)setPeaks(samples(buffer));
   }catch{/* Native audio controls remain functional if waveform decoding is unsupported. */}
   finally{await ctx?.close().catch(()=>{});if(!cancelled)setBusy(false)}
  };
  void process();
  return()=>{cancelled=true};
 },[src]);
 return <div className="cx-voice-message" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}><div className="cx-voice-top"><Headphones size={16}/> Голосове повідомлення</div>
 {peaks.length>0&&<div className="cx-voice-wave" aria-label="Хвиля звукового повідомлення">{peaks.map((height,i)=><span key={i} style={{height:height+'%'}}/>)}</div>}
 {busy&&!peaks.length&&<div className="cx-voice-skeleton" aria-hidden="true"/>}
 <audio ref={ref} preload="metadata" controls className="msg-audio" src={src}/>
 </div>;
}

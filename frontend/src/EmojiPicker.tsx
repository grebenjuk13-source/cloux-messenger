import React,{useEffect,useState} from 'react';
import {Search,X} from 'lucide-react';
import {useI18n} from './i18n';
import {emojiLabel,modifiers,toneEmoji} from './emoji-i18n';

type Category={name:string;icon:string;items:string[]};
const categories:Category[]=[
{name:'Обличчя',icon:'😀',items:['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','😊','😇','🙂','🙃','😉','😍','🥰','😘','😗','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','😐','😑','😶','🫥','😏','😒','🙄','😬','😮‍💨','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🥳','😎','🤓','🧐','😕','🫤','😟','🙁','☹️','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','👻','👽','🤖','💩']},
{name:'Люди',icon:'🫶',items:['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫶','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🧠','👀','👂','👃','👄','👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵','🙋','🙆','🙅','🤷','🤦','🧘','🚶','🏃','💃','🕺']},
{name:'Серця',icon:'❤️',items:['❤️','🩷','🧡','💛','💚','💙','🩵','💜','🤎','🖤','🩶','🤍','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','💌','💋','💯','🔥','✨','⭐','🌟','💫','💥','✅','⚡','💬']},
{name:'Тварини',icon:'🐱',items:['🐶','🐱','🐈','🐈‍⬛','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🦆','🦉','🦋','🐝','🐞','🐢','🐬','🐳','🐙','🦄','🦖','🐲','🌷','🌹','🌻','🌸','🍀','🌲','🌴','🌵','🌈','☀️','🌙','⭐','❄️','🌊','☁️','🌧️']},
{name:'Їжа',icon:'🍕',items:['🍎','🍏','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🥑','🍆','🥦','🥒','🌶️','🌽','🥕','🥔','🍞','🥐','🥖','🥨','🧀','🥚','🍳','🥞','🥓','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮','🌯','🥗','🍝','🍜','🍣','🍤','🍦','🍩','🍪','🎂','🍰','🍫','🍬','🍭','☕','🧋','🧃','🥤','🍵']},
{name:'Активності',icon:'⚽',items:['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🥋','🎮','🕹️','🎲','♟️','🧩','🎯','🎨','🎭','🎤','🎧','🎹','🥁','🎸','🎻','🎬','📸','🎟️','🎡','🎢','🎉','🎊','🎈','🎁','🏆','🥇','🥈','🥉','🚴','🏊','🏄','⛷️','🏂']},
{name:'Подорожі',icon:'🚀',items:['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚚','🚲','🛴','🏍️','🚂','🚆','🚇','✈️','🚀','🛸','🚁','🚢','⛵','⚓','🏝️','🏖️','⛺','🏕️','🏠','🏡','🏢','🏰','🗼','🗽','🌋','🗻','🌍','🌎','🌏','🗺️','🧭','⏰','🕰️']},
{name:'Предмети',icon:'💡',items:['📱','💻','⌨️','🖥️','🖨️','🖱️','💾','💿','📷','📹','📺','📻','🎙️','🔋','🔌','💡','🔦','🕯️','📚','📖','📝','✏️','🖊️','📎','✂️','🔒','🔑','🔨','🛠️','🧰','⚙️','🧲','🔬','🔭','💰','💵','💎','🪙','🛍️','📦','📬','📌','📍','🎀','🧸','🪄','🪩','🔔','🔕','🛡️']},
{name:'Символи',icon:'🔣',items:['❤️','💯','✅','❎','❌','⚠️','🚫','♻️','🔞','🆘','❓','❔','❗','❕','‼️','⁉️','💤','💢','💬','🗯️','♠️','♥️','♦️','♣️','🃏','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','▶️','⏸️','⏹️','🔁','🔀','⬆️','⬇️','➡️','⬅️','✔️','➕','➖','➗']}
];
const aliases:Record<string,string>={
'❤️':'серце любов кохання червоний heart','🩷':'рожеве серце','🖤':'чорне серце','🤍':'біле серце','💙':'синє серце','💔':'розбите серце',
'😂':'сміх сміятися сльози lol','🤣':'сміх дуже смішно','😭':'плач сльози сум','😊':'усмішка посмішка щастя',
'😍':'закоханий сердечка','🥰':'любов ніжність обійми','😘':'поцілунок','😎':'круто окуляри',
'🤔':'думати задумався','😡':'злий гнів','🥺':'благаю','😴':'сон спати',
'👍':'так лайк добре палець','👎':'ні дизлайк','👏':'оплески браво','🙏':'дякую прошу молитва',
'🔥':'вогонь топ гаряче','✨':'блискітки сяйво','⭐':'зірка','⚡':'блискавка','💯':'супер сто',
'🎉':'свято вечірка','🎂':'торт день народження','👻':'привид','🐱':'кіт котик','🐶':'собака пес',
'🍕':'піца їжа','🍔':'бургер їжа','⚽':'футбол мяч','🎮':'ігри геймпад','🚀':'ракета космос',
'💡':'лампочка ідея','✅':'галочка так готово','❌':'хрестик ні','🌹':'троянда квітка'
};
type Props={style:'apple'|'telegram';onPick:(v:string)=>void;onClose:()=>void;closeOnPick?:boolean};
export default function EmojiPicker({onPick,onClose,closeOnPick=false}:Props){const {locale,t}=useI18n();const [tone,setTone]=useState(()=>{try{return localStorage.getItem('cloux:skin-tone')||''}catch{return ''}});
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState('Нещодавні');
 const [closing,setClosing]=useState(false);
 const [recent,setRecent]=useState<string[]>(()=>{try{const values=JSON.parse(localStorage.getItem('cloux:recent:emoji')||'[]');return Array.isArray(values)?values.filter((v):v is string=>typeof v==='string').slice(0,32):[]}catch{return []}});
 const all=[{name:emojiLabel(locale,0),icon:'🕘',items:recent.length?recent:['❤️','👍','😂','🔥','🥰','👏','🤔','✨']},...categories.map((cat,i)=>({...cat,name:emojiLabel(locale,i+1)}))];
 const q=query.trim().toLocaleLowerCase(locale);
 const active=all.find(x=>x.name===selected)||all[0];
 const items=q?[...new Set(all.flatMap(x=>x.items))].filter(e=>e.includes(q)||(aliases[e]||'').includes(q)||categories.some(g=>g.items.includes(e)&&g.name.toLocaleLowerCase('uk').includes(q))):active.items;
 const close=()=>setClosing(true);
 useEffect(()=>{if(!closing)return;const id=window.setTimeout(onClose,250);return()=>window.clearTimeout(id)},[closing,onClose]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setClosing(true)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
 function pick(chosen:string){const emoji=toneEmoji(chosen,tone);const next=[emoji,...recent.filter(e=>e!==emoji)].slice(0,32);setRecent(next);try{localStorage.setItem('cloux:recent:emoji',JSON.stringify(next))}catch{}if(closeOnPick)close();onPick(emoji)}
 return <div className={'cloux-emoji-overlay'+(closing?' is-closing':'')} onMouseDown={e=>{if(e.target===e.currentTarget)close()}} role="presentation">
   <section className="emoji-panel glass" role="dialog" aria-modal="true" aria-label={emojiLabel(locale,10)}>
     <div className="emoji-panel-top"><strong>{emojiLabel(locale,10)}</strong><button type="button" aria-label={t("close")} onClick={close}><X size={19}/></button></div>
     <label className="emoji-search-row"><Search size={19}/><input aria-label={emojiLabel(locale,11)} autoComplete="off" placeholder={emojiLabel(locale,11)} value={query} onChange={e=>setQuery(e.target.value)}/></label>
     <div className="emoji-section-name">{q?emojiLabel(locale,12):selected}</div>
     <div className="emoji-grid" role="group" aria-label={emojiLabel(locale,10)}>
       {items.length===0?<div className="emoji-no-results">{emojiLabel(locale,13)}</div>:items.map(e=><button type="button" key={e} title={aliases[e]||e} aria-label={aliases[e]||'Емодзі '+e} onClick={()=>pick(e)}><span className="native-emoji" role="img" aria-hidden="true">{e}</span></button>)}
     </div>
     <div className="cx-skin-tones" role="group" aria-label={emojiLabel(locale,14)}>{modifiers.map((m,i)=><button type="button" key={i} className={tone===m?'active':''} aria-label={emojiLabel(locale,14)+' '+(i+1)} onClick={()=>{setTone(m);localStorage.setItem('cloux:skin-tone',m)}}>{toneEmoji('👋',m)}</button>)}</div>
   <nav className="emoji-cats" aria-label="Категорії емодзі">{all.map(x=><button type="button" title={x.name} aria-label={x.name} aria-pressed={selected===x.name&&!q} className={selected===x.name&&!q?'chosen':''} key={x.name} onClick={()=>{setQuery('');setSelected(x.name)}}><span className="native-emoji" aria-hidden="true">{x.icon}</span></button>)}</nav>
   </section>
 </div>
}

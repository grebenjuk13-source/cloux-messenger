import {$,$$,esc,EMOJIS,recentEmoji,rememberEmoji,renderEmoji} from './core.js';
/** Cloux Telegram-style emoji/sticker picker with categories, search and recent choices. */
export function createEmojiPicker(host,onPick,sticker=false){
 const wrap=document.createElement('div');wrap.className='emoji-panel';
 wrap.innerHTML=`<input aria-label="Пошук емодзі" placeholder="Пошук емодзі…" data-emoji-search><div class="emoji-cats"></div><div class="emoji-grid"></div>`;
 host.append(wrap);let category='Нещодавні';const labels=Object.keys(EMOJIS);
 const cats=$('.emoji-cats',wrap);
 for(const label of labels){const b=document.createElement('button');b.title=label;b.textContent=({'Нещодавні':'🕒','Обличчя':'😀','Жести':'👍','Серця':'❤️','Тварини':'🐱','Предмети':'⭐'})[label];b.onclick=()=>{category=label;paint()};cats.append(b)}
 const input=$('[data-emoji-search]',wrap);
 input.oninput=()=>paint();
 function paint(){let selected=category==='Нещодавні'?recentEmoji():EMOJIS[category];const q=input.value.trim().toLowerCase();
  if(q){selected=Object.values(EMOJIS).flat().filter(e=>q==='серце'?['❤️','💙','🤍','🖤'].includes(e):q==='сміх'?['😂','🤣','😄'].includes(e):q==='кіт'?e==='🐱':q==='вогонь'?e==='🔥':e.includes(q));}
  const grid=$('.emoji-grid',wrap);grid.replaceChildren();
  if(!selected.length){grid.innerHTML='<p class="muted small">Емодзі не знайдено</p>';return}
  for(const emoji of selected){const b=document.createElement('button');b.type='button';b.textContent=emoji;b.setAttribute('aria-label',emoji);if(sticker)b.style.fontSize='37px';b.onclick=()=>{rememberEmoji(emoji);onPick(emoji,sticker)};grid.append(b)}
  renderEmoji(wrap);
 }
 paint();return{close(){wrap.remove()},element:wrap};
}
// Shared visual presets used in both onboarding and Cloux settings.
// Wallpapers are CSS gradients/patterns; no copyrighted images are embedded.
export type Wallpaper={id:string;name:string;style:string};
export const palette=[
 '#E11D2E','#FF3B4F','#C71029','#FF5A6D','#FFFFFF','#A9A9B3',
 '#FB7185','#DC2626','#FB923C','#B197FC','#50C7D4','#6ED5A5'
];
const base=[
 ['Чорний оксамит','radial-gradient(circle at 18% 18%,#5c1724 0%,transparent 45%),linear-gradient(140deg,#101013,#020204 85%)'],
 ['Червоний неон','radial-gradient(circle at 85% 12%,#c41a3e 0%,transparent 39%),radial-gradient(circle at 0% 90%,#5a1428 0%,transparent 54%),#08080c'],
 ['Тиха ніч','linear-gradient(142deg,#08090f 14%,#31202c 57%,#08090f 95%)'],
 ['Liquid Glass','radial-gradient(ellipse at 70% 9%,#99374788 0%,transparent 52%),radial-gradient(ellipse at 12% 78%,#4351607a 0%,transparent 58%),#0d0f17'],
 ['Червоні хвилі','repeating-radial-gradient(circle at 3% 120%,#c33f5845 0 3px,transparent 4px 30px),linear-gradient(155deg,#28111a,#07080c)'],
 ['Срібний мінімалізм','linear-gradient(130deg,#292d37,#101319 49%,#37313b)'],
 ['Графіт','repeating-linear-gradient(42deg,#15141c 0 12px,#24202b 13px 14px),#16141b'],
 ['Чорні зорі','radial-gradient(#e8d5e04a .9px,transparent 1.5px),radial-gradient(ellipse at 70% 15%,#43202e,#08090d 74%)'],
 ['Рубін','linear-gradient(150deg,#580d25,#191018 42%,#0a070c 74%,#33081a)'],
 ['Темний океан','radial-gradient(ellipse at 45% 15%,#304554,#090d14 68%)'],
 ['Карманова ніч','radial-gradient(circle at 18% 76%,#dc28484f,transparent 50%),linear-gradient(125deg,#171920,#090a0f)'],
 ['Пульс','repeating-linear-gradient(0deg,#d91b3225 0 1px,transparent 2px 36px),linear-gradient(120deg,#0c0b10,#33131e)'],
];
export const wallpapers:Wallpaper[]=Array.from({length:34},(_,i)=>{
 const [name,style]=base[i%base.length];
 return {id:'w'+i,name:i<base.length?name:name+' '+(Math.floor(i/base.length)+1),style:i<base.length?style:(i%2===0?'radial-gradient(circle at '+(20+(i*13)%65)+'% '+(15+(i*7)%60)+'%,#b81e3b39 0%,transparent 48%),':'')+style};
});
export const DEFAULT_ACCENT='#E11D2E';

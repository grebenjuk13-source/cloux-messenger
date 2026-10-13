import type {Locale} from './i18n';
const titles:Record<Locale,string[]> = {
 uk:['Нещодавні','Обличчя','Люди','Серця','Тварини','Їжа','Активності','Подорожі','Предмети','Символи','Емодзі','Пошук емодзі','Результати пошуку','Нічого не знайдено','Вибір відтінку'],
 en:['Recent','Faces','People','Hearts','Animals','Food','Activities','Travel','Objects','Symbols','Emoji','Search emoji','Search results','No results','Skin tone'],
 pl:['Ostatnie','Twarze','Ludzie','Serca','Zwierzęta','Jedzenie','Aktywności','Podróże','Przedmioty','Symbole','Emotikony','Szukaj emoji','Wyniki','Brak wyników','Odcień skóry'],
 de:['Zuletzt','Gesichter','Menschen','Herzen','Tiere','Essen','Aktivitäten','Reisen','Objekte','Symbole','Emoji','Emoji suchen','Suchergebnisse','Keine Treffer','Hautton'],
 fr:['Récents','Visages','Personnes','Cœurs','Animaux','Nourriture','Activités','Voyages','Objets','Symboles','Emojis','Rechercher','Résultats','Aucun résultat','Teinte de peau'],
 es:['Recientes','Caras','Personas','Corazones','Animales','Comida','Actividades','Viajes','Objetos','Símbolos','Emojis','Buscar emoji','Resultados','Sin resultados','Tono de piel'],
 it:['Recenti','Volti','Persone','Cuori','Animali','Cibo','Attività','Viaggi','Oggetti','Simboli','Emoji','Cerca emoji','Risultati','Nessun risultato','Tonalità pelle'],
 pt:['Recentes','Rostos','Pessoas','Corações','Animais','Comida','Atividades','Viagens','Objetos','Símbolos','Emoji','Procurar emoji','Resultados','Sem resultados','Tom de pele'],
 tr:['Son kullanılanlar','Yüzler','İnsanlar','Kalpler','Hayvanlar','Yemek','Etkinlikler','Seyahat','Nesneler','Semboller','Emoji','Emoji ara','Sonuçlar','Sonuç yok','Ten tonu'],
 ru:['Недавние','Лица','Люди','Сердца','Животные','Еда','Занятия','Путешествия','Предметы','Символы','Эмодзи','Поиск эмодзи','Результаты','Ничего не найдено','Цвет кожи'],
 cs:['Nedávné','Obličeje','Lidé','Srdce','Zvířata','Jídlo','Aktivity','Cestování','Předměty','Symboly','Emoji','Hledat emoji','Výsledky','Nic nenalezeno','Odstín pleti'],
 ro:['Recente','Fețe','Oameni','Inimi','Animale','Mâncare','Activități','Călătorii','Obiecte','Simboluri','Emoji','Caută emoji','Rezultate','Fără rezultate','Nuanța pielii'],
 nl:['Recent','Gezichten','Mensen','Harten','Dieren','Eten','Activiteiten','Reizen','Voorwerpen','Symbolen','Emoji','Emoji zoeken','Resultaten','Geen resultaten','Huidskleur'],
 sv:['Senaste','Ansikten','Människor','Hjärtan','Djur','Mat','Aktiviteter','Resor','Föremål','Symboler','Emoji','Sök emoji','Resultat','Inga resultat','Hudton'],
 ja:['最近','顔','人','ハート','動物','食べ物','活動','旅行','物','記号','絵文字','絵文字を検索','検索結果','結果なし','肌の色'],
 ko:['최근','얼굴','사람','하트','동물','음식','활동','여행','사물','기호','이모지','이모지 검색','검색 결과','검색 결과 없음','피부색'],
 'zh-CN':['最近','表情','人物','爱心','动物','食物','活动','旅行','物品','符号','表情符号','搜索表情','搜索结果','没有结果','肤色'],
 ar:['الأخيرة','الوجوه','الناس','القلوب','الحيوانات','الطعام','الأنشطة','السفر','الأشياء','الرموز','الرموز التعبيرية','بحث عن رموز','نتائج البحث','لا توجد نتائج','لون البشرة'],
 hi:['हाल के','चेहरे','लोग','दिल','जानवर','खाना','गतिविधियाँ','यात्रा','वस्तुएँ','चिह्न','इमोजी','इमोजी खोजें','खोज परिणाम','कोई परिणाम नहीं','त्वचा का रंग']
};
export function emojiLabel(locale:Locale,index:number){return (titles[locale]||titles.uk)[index]}
export const modifiers=['','🏻','🏼','🏽','🏾','🏿'] as const;
const supports=new Set([...('👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫶 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🙏 ✍️ 💅 🤳 💪 🙋 🙆 🙅 🤷 🤦 🧘 🚶 🏃').split(' ')]);
export function toneEmoji(emoji:string,tone:string){
 if(!tone||!supports.has(emoji))return emoji;
 const chars=Array.from(emoji).filter(x=>x!=='\uFE0F');
 return chars[0]+tone+chars.slice(1).join('');
}

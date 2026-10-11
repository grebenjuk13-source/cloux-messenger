import React, {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,CheckCheck,ChevronRight,Eye,EyeOff,Mail,ShieldCheck,Search,X,LoaderCircle,ImagePlus} from 'lucide-react';
import {countries,UA,flag,formatPhone,normalizePhone,validPhone,type Country} from './phone';
import './email-wizard.css';

const DEFAULT_AVATAR='/assets/cloux-default-avatar.jpg';
const MAIL=/^[a-z0-9][a-z0-9.+_-]*@(gmail\.com|googlemail\.com)$/i;
type Mode='register'|'login'|'recovery';
type Phase='email'|'otp'|'phone'|'profile'|'password'|'welcome';
type Availability='bad'|'checking'|'free'|'taken';

async function call<T>(url:string,data?:unknown):Promise<T>{
 const response=await fetch(url,{method:data?'POST':'GET',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:data?JSON.stringify(data):undefined});
 const result=await response.json().catch(()=>({detail:'Сервіс тимчасово недоступний.'}));
 if(!response.ok)throw new Error(result.detail||'Помилка запиту');
 return result as T;
}
function normalizedUser(email:string){return email.trim().toLowerCase().split('@')[0].split('+')[0].replaceAll('.','')}
function passwordRequirements(value:string,email:string,username:string){const v=value.toLowerCase();const local=normalizedUser(email);return [
 ['8+ символів',value.length>=8],['Велика літера',/[A-ZА-ЯІЇЄҐ]/.test(value)],
 ['Мала літера',/[a-zа-яіїєґ]/.test(value)],['Цифра',/\d/.test(value)],
 ['Спецсимвол',/[^\p{L}\p{N}\s]/u.test(value)],['Без пробілів',!(/\s/.test(value))],
 ['Без пошти й позивного',Boolean(username)&&!v.includes(username.toLowerCase())&&!v.includes(email.toLowerCase())&&!v.includes(local)]
 ] as const}

function Crop({file,onCancel,onSave}:{file:File;onCancel:()=>void;onSave:(file:File,url:string)=>void}){
 const [url,setUrl]=useState(''),[zoom,setZoom]=useState(1),[x,setX]=useState(0),[y,setY]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u)},[file]);
 async function save(){setBusy(true);try{const img=new Image();img.src=url;await img.decode();const s=Math.min(img.naturalWidth,img.naturalHeight)/zoom;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Помилка обробки фото');
 const px=Math.max(0,Math.min(img.naturalWidth-s,(img.naturalWidth-s)*(x+100)/200));
 const py=Math.max(0,Math.min(img.naturalHeight-s,(img.naturalHeight-s)*(y+100)/200));
 ctx.drawImage(img,px,py,s,s,0,0,512,512);
 const blob=await new Promise<Blob>((ok,fail)=>canvas.toBlob(b=>b?ok(b):fail(Error('Неможливо зберегти фото')),'image/webp',.9));
 onSave(new File([blob],'cloux-avatar.webp',{type:'image/webp'}),URL.createObjectURL(blob));
 }catch(e){alert(e instanceof Error?e.message:'Помилка фото')}finally{setBusy(false)}}
 return <div className="mail-modal" role="dialog" aria-label="Обрізати власну аватарку"><div className="mail-crop glass"><button className="mail-close" onClick={onCancel}><X/></button><h3>Налаштувати аватарку</h3><div className="mail-crop-preview"><img src={url} alt="Власне фото" style={{transform:`scale(${zoom}) translate(${x/5}%,${y/5}%)`}}/></div>
  <label>Збільшення<input type="range" min="1" max="3" step=".1" value={zoom} onChange={e=>setZoom(+e.target.value)}/></label><label>Позиція по горизонталі<input type="range" min="-100" max="100" value={x} onChange={e=>setX(+e.target.value)}/></label><label>Позиція по вертикалі<input type="range" min="-100" max="100" value={y} onChange={e=>setY(+e.target.value)}/></label><button className="primary full" disabled={busy} onClick={save}>Зберегти фото</button></div></div>
}

export default function EmailWizard({onDone,onLegacy}:{onDone:()=>void;onLegacy:()=>void}){
 const [mode,setMode]=useState<Mode>('register'),[phase,setPhase]=useState<Phase>('email');
 const [email,setEmail]=useState(''),[otp,setOtp]=useState<string[]>(Array(6).fill('')),[grant,setGrant]=useState(''),[recoveryUsername,setRecoveryUsername]=useState('');
 const [country,setCountry]=useState<Country>(UA),[phone,setPhone]=useState(''),[countryOpen,setCountryOpen]=useState(false),[countrySearch,setCountrySearch]=useState('');
 const [display,setDisplay]=useState(''),[username,setUsername]=useState(''),[available,setAvailable]=useState<Availability>('bad');
 const [avatar,setAvatar]=useState(DEFAULT_AVATAR),[avatarFile,setAvatarFile]=useState<File|null>(null),[cropFile,setCropFile]=useState<File|null>(null);
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[showPassword,setShowPassword]=useState(false),[showConfirm,setShowConfirm]=useState(false);
 const [loginPassword,setLoginPassword]=useState(''),[showLoginPass,setShowLoginPass]=useState(false),[retry,setRetry]=useState(0),[configured,setConfigured]=useState(false),[loadingConfig,setLoadingConfig]=useState(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const inputRefs=useRef<(HTMLInputElement|null)[]>([]);
 const full=normalizePhone(phone,country);
 const validEmail=MAIL.test(email.trim())&&email.trim().length<=254&& !email.includes('..');
 const rules=passwordRequirements(password,email,mode==='recovery'?recoveryUsername:username);const strong=rules.every(x=>x[1])&&password===confirm;
 const stage=['email','otp','phone','profile','password','welcome'].indexOf(phase);
 const activePurpose=mode==='recovery'?'recovery':'register';
 useEffect(()=>{call<{email_enabled:boolean}>('/api/v6/config').then(x=>setConfigured(x.email_enabled)).catch(()=>setConfigured(false)).finally(()=>setLoadingConfig(false))},[]);
 useEffect(()=>{if(retry===0)return;const t=setTimeout(()=>setRetry(n=>Math.max(n-1,0)),1000);return()=>clearTimeout(t)},[retry]);
 useEffect(()=>{if(!/^[a-z0-9_]{4,24}$/.test(username)){setAvailable('bad');return};setAvailable('checking');const t=setTimeout(()=>call<{available:boolean}>('/api/v5/username?username='+encodeURIComponent(username)).then(x=>setAvailable(x.available?'free':'taken')).catch(()=>setAvailable('bad')),350);return()=>clearTimeout(t)},[username]);
 async function action(cb:()=>Promise<void>){setBusy(true);setError('');try{await cb()}catch(e){setError(e instanceof Error?e.message:'Сталася помилка. Спробуй ще раз.')}finally{setBusy(false)}}
 function switchMode(m:Mode){setMode(m);setPhase('email');setOtp(Array(6).fill(''));setGrant('');setRetry(0);setError('')}
 async function sendCode(){await action(async()=>{if(!validEmail)throw Error('Введи адресу Gmail або Googlemail.');await call('/api/v6/email/send',{email:email.trim(),purpose:activePurpose});setOtp(Array(6).fill(''));setRetry(60);setPhase('otp')})}
 async function verify(){await action(async()=>{const r=await call<{grant:string;username?:string}>('/api/v6/email/verify',{email:email.trim(),purpose:activePurpose,code:otp.join('')});setGrant(r.grant);if(mode==='recovery')setRecoveryUsername(r.username||'');setPhase(mode==='recovery'?'password':'phone')})}
 function digitChange(i:number,input:string){const digits=input.replace(/\D/g,'').slice(0,6);const next=[...otp];if(digits.length>1){for(let j=0;j<digits.length&&i+j<6;j++)next[i+j]=digits[j];inputRefs.current[Math.min(5,i+digits.length)]?.focus()}else{next[i]=digits;if(digits&&i<5)inputRefs.current[i+1]?.focus()}setOtp(next)}
 async function register(){await action(async()=>{
   if(!full)throw Error('Перевір телефон.');
   await call('/api/v6/register',{email,grant,phone:full,display:display.trim(),username:username.toLowerCase(),password});
   if(avatarFile){try{await fetch('/api/profile/media/avatar',{method:'POST',credentials:'same-origin',headers:{'Content-Type':avatarFile.type},body:avatarFile})}catch{}}
   setPhase('welcome');setTimeout(onDone,1800);
 })}
 async function login(){await action(async()=>{
   try{await call('/api/v6/login',{email:email.trim(),password:loginPassword});onDone()}catch(e){if(e instanceof Error&&e.message.includes('Підтвердіть пошту')){switchMode('register');setError('Підтверди пошту, щоб завершити реєстрацію.');return}throw e}
 })}
 async function reset(){await action(async()=>{await call('/api/v6/password/reset',{email,grant,password});setLoginPassword('');setPassword('');setConfirm('');switchMode('login');setError('Пароль оновлено! Тепер увійди з новим паролем.')})}
 const stepNames=['Google-пошта','Код із пошти','Телефон','Профіль','Пароль','Готово'];
 const withEye=(val:string,change:(v:string)=>void,shown:boolean,toggle:()=>void,placeholder='Пароль')=><div className="mail-pw"><input type={shown?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} placeholder={placeholder} value={val} onChange={e=>change(e.target.value)}/><button aria-label={shown?'Сховати пароль':'Показати пароль'} onClick={toggle}>{shown?<EyeOff size={19}/>:<Eye size={19}/>}</button></div>;
 return <main className="auth-page mail-auth"><div className="auth-glow"/><div className="auth-layout"><div className="auth-side"><img className="auth-logo" src={DEFAULT_AVATAR} alt="Cloux"/><span className="eyebrow">CLOUX MESSENGER</span><h1>Твої розмови.<br/><em>Твій стиль.</em></h1><p>Спілкуйся в сучасному скляному Cloux.</p></div>
 <section className="auth-card glass mail-card"><div className="mail-steps"><span className="eyebrow">{mode==='register'?`РЕЄСТРАЦІЯ · КРОК ${stage+1} З 6`:mode==='recovery'?'ВІДНОВЛЕННЯ ПАРОЛЯ':'ВХІД У CLOUX'}</span>{mode==='register'&&<div className="progress">{stepNames.map((_,i)=><span key={i} className={i<=stage?'fill':''}/>)}</div>}</div>
 {mode==='login'?<><h2>З поверненням!</h2><p className="subtle">Увійди через підтверджену Google-пошту.</p><label>Gmail<input type="email" inputMode="email" autoComplete="email" placeholder="example@gmail.com" value={email} onChange={e=>setEmail(e.target.value.toLowerCase())}/></label><label>Пароль{withEye(loginPassword,setLoginPassword,showLoginPass,()=>setShowLoginPass(!showLoginPass))}</label><button className="primary full" disabled={busy||!validEmail||!loginPassword} onClick={login}>Увійти <ChevronRight size={17}/></button><button className="quiet full" onClick={()=>switchMode('recovery')}>Забув пароль?</button><button className="quiet full" onClick={()=>switchMode('register')}>Створити акаунт</button><button className="quiet full" onClick={onLegacy}>У мене старий акаунт за номером</button></>:
 phase==='email'?<><h2>{mode==='recovery'?'Відновлення пароля':'Твоя Google-пошта'}</h2><p className="subtle">Надішлемо одноразовий код для підтвердження адреси.</p><label>Gmail або Googlemail<input aria-label="Електронна пошта" type="email" inputMode="email" autoComplete="email" value={email} placeholder="yourname@gmail.com" onChange={e=>setEmail(e.target.value.trim().toLowerCase())}/></label>{email&&<p className={'mail-hint '+(validEmail?'good':'bad')}>{validEmail?'✓ Адреса має коректний формат':'Тільки адреси @gmail.com та @googlemail.com'}</p>}{!loadingConfig&&!configured&&<p className="mail-notice"><ShieldCheck size={18}/> Доставка листів ще не підключена власником Cloux. Код поки не надіслати.</p>}
 <button className="primary full" disabled={busy||!validEmail||!configured} onClick={sendCode}><Mail size={19}/> Надіслати код</button>{mode==='register'&&<button className="quiet full" onClick={()=>switchMode('login')}>У мене вже є акаунт · Увійти</button>}{mode==='recovery'&&<button className="quiet full" onClick={()=>switchMode('login')}>Повернутися до входу</button>}</>:
 phase==='otp'?<><button className="back-inline" onClick={()=>setPhase('email')}><ArrowLeft size={17}/> Змінити пошту</button><h2>Підтверди пошту</h2><p className="subtle">Введи 6-значний код, надісланий на <strong>{email}</strong>. Код діє 10 хвилин.</p><div className="mail-code">{otp.map((v,i)=><input key={i} ref={e=>{inputRefs.current[i]=e}} aria-label={`Цифра ${i+1}`} inputMode="numeric" autoComplete={i===0?'one-time-code':'off'} value={v} onChange={e=>digitChange(i,e.target.value)} onPaste={e=>{const pasted=e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);if(pasted.length>1){e.preventDefault();digitChange(i,pasted)}}} onKeyDown={e=>{if(e.key==='Backspace'&&!v&&i>0)inputRefs.current[i-1]?.focus()}}/>)}</div><button className="primary full" disabled={busy||otp.join('').length!==6} onClick={verify}>Підтвердити пошту <ChevronRight size={17}/></button><button className="quiet full" disabled={busy||retry>0} onClick={sendCode}>{retry>0?`Надіслати ще раз через ${retry} с`:'Надіслати код ще раз'}</button><p className="subtle">Максимум 5 спроб. Після помилок — пауза 15 хвилин.</p></>:
 phase==='phone'?<><button className="back-inline" onClick={()=>setPhase('otp')}><ArrowLeft size={17}/> Назад</button><h2>Номер телефону</h2><p className="subtle">Цей номер потрібен тільки для профілю — SMS не надсилаємо.</p><label>Країна<button className="country-pick" onClick={()=>setCountryOpen(true)}>{flag(country.code)} {country.name} · {country.dial}<ChevronRight size={16}/></button></label><label>Телефон<input type="tel" inputMode="tel" autoComplete="tel" placeholder={country.code==='UA'?'067 123 45 67':'Номер телефону'} value={phone} onChange={e=>setPhone(formatPhone(e.target.value,country))}/></label><button className="primary full" disabled={!validPhone(phone,country)} onClick={()=>setPhase('profile')}>Далі <ChevronRight size={17}/></button></>:
 phase==='profile'?<><button className="back-inline" onClick={()=>setPhase('phone')}><ArrowLeft size={17}/> Назад</button><h2>Створи профіль</h2><p className="subtle">Твоя аватарка, ім’я й унікальний @username.</p><div className="avatar-picker"><img src={avatar} alt="Аватар"/><label className="small-action"><ImagePlus size={15}/> Вибрати з галереї<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)setCropFile(file)}}/></label></div><label>Ім’я<input value={display} maxLength={60} onChange={e=>setDisplay(e.target.value)} placeholder="Твоє ім’я"/></label><label>Позивний<div className="input-with-icon"><span>@</span><input value={username} maxLength={24} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} placeholder="username"/></div></label><p className={'mail-hint '+(available==='free'?'good':available==='taken'?'bad':'')}>{available==='free'?'✓ Позивний вільний':available==='taken'?'Позивний зайнятий':available==='checking'?'Перевіряємо позивний…':'Мінімум 4 символи: латиниця, цифри або _'}</p><button className="primary full" disabled={!display.trim()||available!=='free'} onClick={()=>setPhase('password')}>Продовжити <ChevronRight size={17}/></button></>:
 phase==='password'?<><button className="back-inline" onClick={()=>setPhase(mode==='recovery'?'otp':'profile')}><ArrowLeft size={17}/> Назад</button><h2>{mode==='recovery'?'Новий пароль':'Захисти свій акаунт'}</h2><p className="subtle">Пароль зберігатиметься на сервері як Argon2-хеш.</p><label>Пароль{withEye(password,setPassword,showPassword,()=>setShowPassword(!showPassword))}</label><label>Підтвердження пароля{withEye(confirm,setConfirm,showConfirm,()=>setShowConfirm(!showConfirm),'Повтори пароль')}</label>{confirm&&confirm!==password&&<p className="mail-hint bad">Паролі не збігаються</p>}<div className="strength"><div>{[1,2,3].map(n=><span key={n} className={rules.filter(x=>x[1]).length>n*2?'lit':''}/>)}</div><small>{rules.filter(x=>x[1]).length<4?'Слабкий':rules.filter(x=>x[1]).length<7?'Середній':'Сильний'}</small></div><div className="password-checks">{rules.map(([name,ok])=><div className={ok?'ok':''} key={name}>{ok?<Check size={14}/>:<X size={13}/>} {name}</div>)}</div><button className="primary full" disabled={!strong||busy} onClick={mode==='recovery'?reset:register}>{busy?'Зачекай…':mode==='recovery'?'Змінити пароль':'Створити акаунт'} <ChevronRight size={17}/></button></>:
 <div className="mail-welcome"><CheckCheck size={56}/><h2>Вітаємо у Cloux!</h2><p>Пошта підтверджена. Починаємо спілкування.</p></div>}
 {error&&<p className="error" role="alert">{error}</p>}
 {countryOpen&&<div className="mail-modal" role="dialog" aria-label="Вибір країни"><div className="mail-countries glass"><header><b>Обери країну</b><button onClick={()=>setCountryOpen(false)}><X/></button></header><div className="input-with-icon"><Search size={17}/><input autoFocus placeholder="Пошук назви або коду" value={countrySearch} onChange={e=>setCountrySearch(e.target.value)}/></div><div className="mail-country-list">{countries.filter(c=>(c.code+c.dial+c.name).toLowerCase().includes(countrySearch.toLowerCase())).map(c=><button key={c.code} onClick={()=>{setCountry(c);setCountryOpen(false);setPhone('');setCountrySearch('')}}>{flag(c.code)} <span>{c.name}</span><small>{c.dial}</small></button>)}</div></div></div>}
 {cropFile&&<Crop file={cropFile} onCancel={()=>setCropFile(null)} onSave={(f,u)=>{setAvatarFile(f);setAvatar(u);setCropFile(null)}}/>}
 </section></div></main>
}
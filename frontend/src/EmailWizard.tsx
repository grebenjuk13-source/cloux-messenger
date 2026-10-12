import React, {useState} from 'react';
import {ChevronRight, Eye, EyeOff, LockKeyhole} from 'lucide-react';
import './email-wizard.css';

type Mode='register'|'login';
const DEFAULT_AVATAR='/assets/cloux-default-avatar.jpg';

async function call(url:string,data:unknown){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});
 const result=await response.json().catch(()=>({detail:'Сервіс тимчасово недоступний.'}));
 if(!response.ok)throw new Error(result.detail||'Не вдалося виконати запит.');
 return result;
}

export default function EmailWizard({onDone}:{onDone:()=>void}){
 const [mode,setMode]=useState<Mode>('register');
 const [email,setEmail]=useState(''),[phone,setPhone]=useState('');
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [showPassword,setShowPassword]=useState(false),[showConfirm,setShowConfirm]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const registering=mode==='register';

 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  const normalizedEmail=email.trim().toLowerCase();
  const normalizedPhone=phone.trim().replace(/[\s()-]/g,'');
  if(registering&&!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)){setError('Введіть номер у міжнародному форматі, наприклад +380501234567.');return}
  if(password.length<8||password.length>128){setError('Пароль Cloux має містити від 8 до 128 символів.');return}
  if(registering&&password!==confirm){setError('Паролі Cloux не збігаються.');return}
  setBusy(true);setError('');
  try{
   await call(registering?'/api/v6/register':'/api/v6/login',registering?{email:normalizedEmail,phone:normalizedPhone,password}:{email:normalizedEmail,password});
   onDone();
  }catch(e){setError(e instanceof Error?e.message:'Сталася помилка. Спробуйте ще раз.')}
  finally{setBusy(false)}
 }

 function switchMode(next:Mode){setMode(next);setError('');setPassword('');setConfirm('')}
 const passwordField=(value:string,setValue:(value:string)=>void,shown:boolean,toggle:()=>void,label:string,autocomplete:string)=><label>{label}<div className="mail-pw"><input type={shown?'text':'password'} autoComplete={autocomplete} minLength={8} maxLength={128} placeholder="Вигадай окремий пароль Cloux" value={value} onChange={e=>setValue(e.target.value)} required/><button type="button" aria-label={shown?'Сховати пароль':'Показати пароль'} onClick={toggle}>{shown?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>;

 return <main className="auth-page mail-auth"><div className="auth-glow"/><div className="auth-layout">
  <div className="auth-side"><img className="auth-logo" src={DEFAULT_AVATAR} alt="Cloux"/><span className="eyebrow">CLOUX MESSENGER</span><h1>Твої розмови.<br/><em>Твій стиль.</em></h1><p>Спілкуйся в сучасному скляному Cloux.</p></div>
  <section className="auth-card glass mail-card" aria-labelledby="auth-title">
   <div className="mail-steps"><span className="eyebrow">{registering?'СТВОРЕННЯ АКАУНТА':'ВХІД У CLOUX'}</span></div>
   <h2 id="auth-title">{registering?'Створи акаунт Cloux':'З поверненням!'}</h2>
   <p className="subtle">{registering?'Вкажи номер, email і створи окремий пароль Cloux.':'Увійди за email і паролем Cloux.'}</p>
   <form onSubmit={submit}>
    <label>Електронна пошта<input type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
    {registering&&<label>Номер телефону<input type="tel" inputMode="tel" autoComplete="tel" placeholder="+380501234567" value={phone} onChange={e=>setPhone(e.target.value)} required/></label>}
    {passwordField(password,setPassword,showPassword,()=>setShowPassword(!showPassword),'Пароль Cloux',registering?'new-password':'current-password')}
    {registering&&passwordField(confirm,setConfirm,showConfirm,()=>setShowConfirm(!showConfirm),'Повтори пароль Cloux','new-password')}
    <p className="password-note"><LockKeyhole size={15}/> Не вводь пароль від Gmail чи іншої пошти. Cloux використовує окремий пароль акаунта.</p>
    {registering&&<p className="subtle auth-foot">Email поки не перевіряється. Переконайся, що адреса введена правильно; відновлення забутого пароля наразі недоступне.</p>}
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <button className="primary full" type="submit" disabled={busy}>{busy?'Зачекай…':registering?'Створити акаунт':'Увійти'} <ChevronRight size={17}/></button>
   </form>
   <button className="quiet full" type="button" disabled={busy} onClick={()=>switchMode(registering?'login':'register')}>{registering?'Уже маєш акаунт? Увійти':'Ще немає акаунта? Створити'}</button>
   <p className="auth-foot">{registering?'Email — це адреса акаунта; пароль Cloux має бути окремим.':'Тут потрібен пароль Cloux, не пароль поштової скриньки.'}</p>
  </section>
 </div></main>;
}

import React, {useState} from 'react';
import {ChevronRight, Eye, EyeOff, LockKeyhole} from 'lucide-react';
import './email-wizard.css';

const DEFAULT_AVATAR='/assets/cloux-default-avatar.jpg';

async function call(url:string,data:unknown){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});
 const result=await response.json().catch(()=>({detail:'Сервіс тимчасово недоступний.'}));
 if(!response.ok)throw new Error(result.detail||'Не вдалося виконати запит.');
 return result;
}

export default function EmailWizard({onDone}:{onDone:()=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [showPassword,setShowPassword]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');

 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  const normalizedEmail=email.trim().toLowerCase();
  if(password.length<1||password.length>128){setError('Введіть пароль Cloux.');return}
  setBusy(true);setError('');
  try{
   await call('/api/v6/login',{email:normalizedEmail,password});
   onDone();
  }catch(e){setError(e instanceof Error?e.message:'Сталася помилка. Спробуйте ще раз.')}
  finally{setBusy(false)}
 }

 return <main className="auth-page mail-auth"><div className="auth-glow"/><div className="auth-layout">
  <div className="auth-side"><img className="auth-logo" src={DEFAULT_AVATAR} alt="Cloux"/><span className="eyebrow">CLOUX MESSENGER</span><h1>Твої розмови.<br/><em>Твій стиль.</em></h1><p>Спілкуйся в сучасному скляному Cloux.</p></div>
  <section className="auth-card glass mail-card" aria-labelledby="auth-title">
   <div className="mail-steps"><span className="eyebrow">ВХІД У CLOUX</span></div>
   <h2 id="auth-title">Увійти до Cloux</h2>
   <p className="subtle">Вхід доступний для користувачів, які вже мають акаунт.</p>
   <form onSubmit={submit}>
    <label>Електронна пошта<input type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
    <label>Пароль Cloux<div className="mail-pw"><input type={showPassword?'text':'password'} autoComplete="current-password" maxLength={128} placeholder="Пароль Cloux" value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" aria-label={showPassword?'Сховати пароль':'Показати пароль'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
    <p className="password-note"><LockKeyhole size={15}/> Не вводь пароль від Gmail чи іншої пошти. Тут потрібен пароль Cloux.</p>
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <button className="primary full" type="submit" disabled={busy}>{busy?'Зачекай…':'Увійти'} <ChevronRight size={17}/></button>
   </form>
   <p className="auth-foot">Створення нових акаунтів тимчасово вимкнено.</p>
  </section>
 </div></main>;
}

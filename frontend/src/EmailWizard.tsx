import React, {useState} from 'react';
import {ChevronRight, Eye, EyeOff, LockKeyhole} from 'lucide-react';
import './email-wizard.css';

const DEFAULT_AVATAR='/assets/cloux-default-avatar.jpg';
async function call(url:string,data:unknown){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});
 const result=await response.json().catch(()=>({detail:'Спробуй ще раз трохи пізніше.'}));
 if(!response.ok)throw new Error(result.detail||'Не вдалося виконати запит.');return result;
}
export default function EmailWizard({onDone}:{onDone:()=>void}){
 const [mode,setMode]=useState<'register'|'login'>('register'),[email,setEmail]=useState(''),[phone,setPhone]=useState(''),[username,setUsername]=useState(''),[display,setDisplay]=useState(''),[password,setPassword]=useState('');
 const [showPassword,setShowPassword]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setError('');try{
  if(mode==='register')await call('/api/v6/register',{email:email.trim().toLowerCase(),phone,username:username.trim().replace(/^@/,''),display:display.trim(),password});
  else await call('/api/v6/login',{identifier:email.trim(),password});onDone();
 }catch(e){setError(e instanceof Error?e.message:'Не вдалося виконати дію. Спробуй ще раз.')}finally{setBusy(false)}}
 return <main className="auth-page mail-auth"><div className="auth-glow"/><div className="auth-layout">
  <div className="auth-side"><img className="auth-logo" src={DEFAULT_AVATAR} alt="Cloux"/><span className="eyebrow">CLOUX MESSENGER</span><h1>Твої розмови.<br/><em>Твій стиль.</em></h1><p>Знайомся, спілкуйся та залишайся на зв’язку.</p></div>
  <section className="auth-card glass mail-card" aria-labelledby="auth-title"><div className="mail-steps"><span className="eyebrow">{mode==='register'?'ТВІЙ ПРОФІЛЬ':'З РАДІСТЮ ЗНОВУ БАЧИТИ'}</span></div>
   <h2 id="auth-title">{mode==='register'?'Приєднатися до Cloux':'Увійти до Cloux'}</h2><p className="subtle">{mode==='register'?'Створи акаунт за хвилину.':'Увійди до свого акаунта.'}</p>
   <form onSubmit={submit}>
    {mode==='register'&&<><label>Як тебе звати<input autoComplete="name" maxLength={48} placeholder="Твоє ім’я" value={display} onChange={e=>setDisplay(e.target.value)} required/></label><label>Нікнейм<input autoComplete="username" maxLength={32} placeholder="наприклад, cloux_friend" value={username} onChange={e=>setUsername(e.target.value)} required/></label><label>Номер телефону<input type="tel" inputMode="tel" autoComplete="tel" maxLength={24} placeholder="+380 00 000 00 00" value={phone} onChange={e=>setPhone(e.target.value)} required/></label></>}
    <label>{mode==='register'?'Електронна пошта':'Пошта або телефон'}<input type={mode==='register'?'email':'text'} inputMode={mode==='register'?'email':'text'} autoComplete={mode==='register'?'email':'username'} maxLength={254} placeholder={mode==='register'?'name@example.com':'name@example.com або +380…'} value={email} onChange={e=>setEmail(e.target.value)} required/></label>
    <label>Пароль Cloux<div className="mail-pw"><input type={showPassword?'text':'password'} autoComplete={mode==='register'?'new-password':'current-password'} minLength={mode==='register'?8:1} maxLength={128} placeholder={mode==='register'?'Щонайменше 8 символів':'Пароль Cloux'} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" aria-label={showPassword?'Сховати пароль':'Показати пароль'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
    <p className="password-note"><LockKeyhole size={15}/> Пароль пошти не потрібен. Придумай окремий пароль Cloux.</p>{error&&<p className="auth-error" role="alert">{error}</p>}
    <button className="primary full" type="submit" disabled={busy}>{busy?'Зачекай…':mode==='register'?'Створити акаунт':'Увійти'} <ChevronRight size={17}/></button>
   </form><p className="auth-foot">{mode==='register'?'Вже з нами?':'Ще не маєш акаунта?'} <button className="auth-switch" onClick={()=>{setMode(mode==='register'?'login':'register');setError('')}}>{mode==='register'?'Увійти':'Зареєструватися'}</button></p>
  </section></div></main>;
}

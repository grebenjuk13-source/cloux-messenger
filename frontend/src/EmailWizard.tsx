import React, {useState} from 'react';
import {ChevronRight, Eye, EyeOff} from 'lucide-react';
import './email-wizard.css';
import {useI18n} from './i18n';

const DEFAULT_AVATAR='/assets/cloux-default-avatar.jpg';
async function call(url:string,data:unknown){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});
 const result=await response.json().catch(()=>({detail:'Спробуй ще раз трохи пізніше.'}));
 if(!response.ok)throw new Error(result.detail||'Не вдалося виконати запит.');return result;
}
export default function EmailWizard({onDone}:{onDone:()=>void}){
 const {t}=useI18n();
 const [mode,setMode]=useState<'register'|'login'>('register'),[email,setEmail]=useState(''),[phone,setPhone]=useState(''),[username,setUsername]=useState(''),[display,setDisplay]=useState(''),[password,setPassword]=useState('');
 const [showPassword,setShowPassword]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setError('');try{
  if(mode==='register')await call('/api/v6/register',{email:email.trim().toLowerCase(),phone,username:username.trim().replace(/^@/,''),display:display.trim(),password});
  else await call('/api/v6/login',{identifier:email.trim(),password});onDone();
 }catch(e){setError(e instanceof Error?e.message:'Не вдалося виконати дію. Спробуй ще раз.')}finally{setBusy(false)}}
 return <main className="auth-page mail-auth"><div className="auth-glow"/><div className="auth-layout">
  <div className="auth-side"><div className="cloux-cloud-frame"><img className="auth-logo" src={DEFAULT_AVATAR} alt="Cloux"/></div><span className="eyebrow">CLOUX MESSENGER</span><h1>{t("tagline")}</h1><p>{t("connected")}</p></div>
  <section className="auth-card glass mail-card" aria-labelledby="auth-title"><div className="mail-mobile-cloud cloux-cloud-frame"><img src={DEFAULT_AVATAR} alt="Cloux"/></div>
   <h2 id="auth-title">{mode==='register'?t('join'):t('login')}</h2>
   <form onSubmit={submit}>
    {mode==='register'&&<><label>{t('name')}<input autoComplete="name" maxLength={48} placeholder={t('name')} value={display} onChange={e=>setDisplay(e.target.value)} required/></label><label>{t('username')}<input autoComplete="username" maxLength={32} placeholder="@username" value={username} onChange={e=>setUsername(e.target.value)} required/></label><label>{t('phone')}<input type="tel" inputMode="tel" autoComplete="tel" maxLength={24} placeholder="+380 00 000 00 00" value={phone} onChange={e=>setPhone(e.target.value)} required/></label></>}
    <label>{mode==='register'?t('email'):t('emailPhone')}<input type={mode==='register'?'email':'text'} inputMode={mode==='register'?'email':'text'} autoComplete={mode==='register'?'email':'username'} maxLength={254} placeholder={mode==='register'?'name@example.com':'Email / +380…'} value={email} onChange={e=>setEmail(e.target.value)} required/></label>
    <label>{t('password')}<div className="mail-pw"><input type={showPassword?'text':'password'} autoComplete={mode==='register'?'new-password':'current-password'} minLength={mode==='register'?8:1} maxLength={128} placeholder={mode==='register'?t('minimum'):t('password')} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" aria-label={showPassword?t('hidePassword'):t('showPassword')} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <button className="primary full" type="submit" disabled={busy}>{busy?t('wait'):mode==='register'?t('create'):t('login')} <ChevronRight size={17}/></button>
   </form><p className="auth-foot">{mode==='register'?t('already'):t('newHere')} <button className="auth-switch" onClick={()=>{setMode(mode==='register'?'login':'register');setError('')}}>{mode==='register'?t('login'):t('register')}</button></p>
  </section></div></main>;
}

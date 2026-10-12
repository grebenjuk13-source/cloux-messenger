import React,{useEffect,useState} from 'react';
import {ChevronRight,Eye,EyeOff,LockKeyhole,Check,AlertCircle} from 'lucide-react';
import './email-wizard.css';

const DEFAULT_AVATAR='/assets/cloux-default-avatar.jpg';
type Field='display'|'username'|'phone'|'email'|'password';
type Values=Record<Field,string>;
const empty:Values={display:'',username:'',phone:'',email:'',password:''};
const mail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nick=/^[a-z0-9_]{3,32}$/i;

function formatUA(input:string){
 const cleaned=input.replace(/[^+\d]/g,'');
 if(!cleaned.startsWith('+380'))return cleaned.slice(0,16);
 const rest=cleaned.slice(4).replace(/\D/g,'').slice(0,9);
 const parts=[rest.slice(0,2),rest.slice(2,5),rest.slice(5,7),rest.slice(7,9)].filter(Boolean);
 return '+380'+(parts.length?' '+parts.join(' '):'');
}
function validate(values:Values,mode:'register'|'login'):Partial<Record<Field,string>>{
 const e:Partial<Record<Field,string>>={};
 if(mode==='login'){
  if(!values.email.trim())e.email='Введіть email, нікнейм або номер телефону.';
  if(!values.password)e.password='Введіть пароль Cloux.';
  return e;
 }
 if(values.display.trim().length<2)e.display='Ім’я має містити щонайменше 2 символи.';
 if(!nick.test(values.username.trim().replace(/^@/,'')))e.username='3–32 символи: латиниця, цифри або _.';
 const digits=values.phone.replace(/\D/g,'');
 if(digits.length<7||digits.length>15)e.phone='Введіть дійсний номер телефону з кодом країни.';
 if(!mail.test(values.email.trim()))e.email='Введіть правильну електронну пошту.';
 if(values.password.length<8)e.password='Пароль повинен мати щонайменше 8 символів.';
 return e;
}
async function call(url:string,data:unknown){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});
 const result=await response.json().catch(()=>({detail:'Спробуйте трохи пізніше.'}));
 if(!response.ok)throw new Error(result.detail||'Не вдалося виконати запит.');
 return result;
}
export default function EmailWizard({onDone}:{onDone:()=>void}){
 const [mode,setMode]=useState<'register'|'login'>('register');
 const [values,setValues]=useState<Values>(empty);
 const [touched,setTouched]=useState<Partial<Record<Field,boolean>>>({});
 const [showPassword,setShowPassword]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [availability,setAvailability]=useState<'idle'|'checking'|'free'|'taken'>('idle');
 const fields=validate(values,mode);
 const value=(key:Field)=>values[key];
 function change(key:Field,next:string){
  setValues(old=>({...old,[key]:key==='phone'?formatUA(next):next}));
  setError('');
 }
 useEffect(()=>{
  if(mode!=='register'||!nick.test(values.username.replace(/^@/,''))){setAvailability('idle');return}
  setAvailability('checking');
  const controller=new AbortController();
  const timer=window.setTimeout(async()=>{
   try{
    const response=await fetch('/api/v6/username-available?username='+encodeURIComponent(values.username.replace(/^@/,'')),{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error();
    const result=await response.json() as {available:boolean};
    setAvailability(result.available?'free':'taken');
   }catch{if(!controller.signal.aborted)setAvailability('idle')}
  },380);
  return()=>{window.clearTimeout(timer);controller.abort()};
 },[values.username,mode]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  setTouched({display:true,username:true,phone:true,email:true,password:true});
  if(Object.keys(fields).length||mode==='register'&&availability==='taken')return;
  setBusy(true);setError('');
  try{
   if(mode==='register'){
    await call('/api/v6/register',{
      email:values.email.trim().toLowerCase(),phone:values.phone.replace(/\s/g,''),
      username:values.username.trim().replace(/^@/,'').toLowerCase(),
      display:values.display.trim(),password:values.password
    });
   }else{
    await call('/api/v6/login',{identifier:values.email.trim(),password:values.password});
   }
   onDone();
  }catch(e){setError(e instanceof Error?e.message:'Не вдалося виконати дію.')}
  finally{setBusy(false)}
 }
 const label=(id:Field,name:string,options?:{autoComplete?:string;type?:string;placeholder?:string;maxLength?:number;inputMode?:'tel'|'email'|'text'})=>{
   const validation=touched[id]&&fields[id];
   return <label className="cloux-auth-field" htmlFor={'cloux-'+id}>{name}
    <input id={'cloux-'+id} type={options?.type||'text'} autoComplete={options?.autoComplete} maxLength={options?.maxLength}
     inputMode={options?.inputMode} placeholder={options?.placeholder} value={value(id)} onBlur={()=>setTouched(t=>({...t,[id]:true}))}
     onChange={e=>change(id,e.target.value)} disabled={busy} aria-invalid={Boolean(validation)} aria-describedby={validation?'cloux-error-'+id:undefined} required/>
    {validation&&<small className="cloux-field-error" id={'cloux-error-'+id}><AlertCircle size={13}/>{validation}</small>}
   </label>;
 };
 return <main className="auth-page mail-auth">
 <div className="auth-glow"/>
 <div className="auth-layout">
  <div className="auth-side"><img className="auth-logo" src={DEFAULT_AVATAR} alt="Cloux"/><span className="eyebrow">CLOUX MESSENGER</span><h1>Твої розмови.<br/><em>Твій стиль.</em></h1><p>Знайомся, спілкуйся та залишайся на зв’язку.</p></div>
  <section className="auth-card glass mail-card" aria-labelledby="auth-title">
   <span className="eyebrow">{mode==='register'?'ТВІЙ ПРОФІЛЬ':'РАДІ ЗНОВУ БАЧИТИ'}</span>
   <h2 id="auth-title">{mode==='register'?'Приєднатися до Cloux':'Увійти до Cloux'}</h2>
   <p className="subtle">{mode==='register'?'Створи новий акаунт.':'Увійди до свого Cloux без повторної реєстрації.'}</p>
   <form onSubmit={e=>void submit(e)} noValidate>
    {mode==='register'&&<>
     {label('display','Як тебе звати',{autoComplete:'name',maxLength:48,placeholder:'Твоє ім’я'})}
     {label('username','Нікнейм',{autoComplete:'username',maxLength:32,placeholder:'наприклад, cloux_friend'})}
     {nick.test(values.username)&&<small className={'cloux-username-state '+availability} role="status">
      {availability==='checking'?'Перевірка нікнейма…':availability==='free'?<><Check size={13}/> Нікнейм вільний</>:availability==='taken'?'Нікнейм уже зайнятий':''}
     </small>}
     {label('phone','Номер телефону',{type:'tel',inputMode:'tel',autoComplete:'tel',maxLength:24,placeholder:'+380 00 000 00 00'})}
    </>}
    {label('email',mode==='register'?'Електронна пошта':'Пошта, телефон або нікнейм',{type:mode==='register'?'email':'text',inputMode:mode==='register'?'email':'text',autoComplete:mode==='register'?'email':'username',maxLength:254,placeholder:mode==='register'?'name@example.com':'name@example.com, @нік або +380…'})}
    <label className="cloux-auth-field" htmlFor="cloux-password">Пароль Cloux
      <div className="mail-pw">
       <input id="cloux-password" type={showPassword?'text':'password'} value={values.password} onChange={e=>change('password',e.target.value)}
        onBlur={()=>setTouched(t=>({...t,password:true}))} autoComplete={mode==='register'?'new-password':'current-password'}
        maxLength={128} aria-invalid={Boolean(touched.password&&fields.password)} required disabled={busy} placeholder={mode==='register'?'Щонайменше 8 символів':'Твій пароль Cloux'}/>
       <button type="button" aria-label={showPassword?'Приховати пароль':'Показати пароль'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button>
      </div>
      {touched.password&&fields.password&&<small className="cloux-field-error"><AlertCircle size={13}/>{fields.password}</small>}
    </label>
    <p className="password-note"><LockKeyhole size={15}/> Не вводь пароль від своєї пошти — лише окремий пароль Cloux.</p>
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <button className="primary full" type="submit" disabled={busy||mode==='register'&&availability==='taken'}>{busy?'Завантаження…':mode==='register'?'Створити акаунт':'Увійти'} <ChevronRight size={17}/></button>
   </form>
   <p className="auth-foot">{mode==='register'?'Вже з нами?':'Ще не маєш акаунта?'} <button className="auth-switch" type="button" onClick={()=>{setMode(mode==='register'?'login':'register');setTouched({});setError('')}}>{mode==='register'?'Увійти':'Зареєструватися'}</button></p>
  </section>
 </div></main>;
}

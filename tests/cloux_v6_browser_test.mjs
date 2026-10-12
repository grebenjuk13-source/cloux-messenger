import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const HOST='http://127.0.0.1:4173/v5/';
const me={id:'e2e-owner',display:'Cloux Demo',username:'cloux_demo',created:1730000000,
 is_admin:true,can_verify_owner:false,badges:[]};
const chats=[
 {id:'cloux-official-news',title:'Новини Cloux',kind:'news',subscribers:12,last_text:'Вітаємо!',last_time:1730000300},
 {id:'personal-1',title:'Друг Cloux',kind:'direct',other_id:'friend',last_text:'Привіт 👋',last_time:1730000100}
];
const stats={users:2,chats:1,messages:1,badges:[],theme:{
 accent:'#C8102E',background:'#0A0A0C',surface:'#16161A',bubble:'#A5122B',text:'#FFFFFF',
 name:'Cloux.',icon:'default',wallpaper:'doodles',radius:18,font:'system'
},features:{registration:true,calls:true,groups:true,channels:true,stickers:true,reactions:true,maintenance:false}};

async function run(browserType,label){
 const browser=await browserType.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let signedIn=false;
 await page.route('**/api/**',async route=>{
  const request=route.request();const path=new URL(request.url()).pathname;const method=request.method();
  const json=(status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/api/me')return json(signedIn?200:401,signedIn?me:{detail:'Потрібен вхід'});
  if(path==='/api/v6/login'&&method==='POST'){signedIn=true;return json(200,{ok:true})}
  if(path==='/api/v6/username-available')return json(200,{available:true});
  if(path==='/api/public/config')return json(200,{theme:stats.theme,features:stats.features});
  if(path==='/api/v5/ui-prefs')return json(200,method==='PUT'?{ok:true}:{preferences:{}});
  if(path==='/api/chats')return json(200,{chats});
  if(path==='/api/admin/overview')return json(200,stats);
  if(path==='/api/admin/users')return json(200,{users:[{id:'friend',display:'Друг Cloux',username:'friend',email_verified:1,blocked:0,muted_until:0,role:'user',badges:[]}]});
  if(path==='/api/admin/audit')return json(200,{logs:[]});
  if(path==='/api/admin/chats')return json(200,{chats:[chats[0]]});
  if(path==='/api/admin/reports')return json(200,{reports:[]});
  if(path.endsWith('/messages'))return json(200,{messages:[{id:1,sender:'e2e-owner',display:'Cloux Demo',text:'Привіт!',created:1730000300}]});
  if(path.includes('/reactions'))return json(200,{reactions:{}});
  if(path.includes('/read-status'))return json(200,{reads:{}});
  if(path.includes('/read'))return json(200,{ok:true});
  if(path==='/api/servers')return json(200,{servers:[]});
  if(path==='/api/chats/personal-1/messages'&&method==='POST')return json(200,{id:2});
  return json(200,{ok:true});
 });
 await page.goto(HOST,{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Приєднатися до Cloux'}).waitFor({timeout:20000});
 const authSurface=await page.locator('.auth-card').evaluate(node=>getComputedStyle(node).backgroundColor);
 assert.ok(!authSurface.includes('255, 250')&&!authSurface.includes('255, 252'),label+' has cream auth box');
 await page.getByRole('button',{name:'Увійти',exact:true}).last().click();
 await page.getByRole('heading',{name:'Увійти до Cloux'}).waitFor();
 await page.locator('#cloux-email').fill('@cloux_demo');
 await page.locator('#cloux-password').fill('SampleStrongPassword#2026');
 await page.getByRole('button',{name:/Увійти/}).last().click();
 await page.locator('.chat-entry').first().waitFor({timeout:20000});
 await page.locator('.chat-entry').filter({hasText:'Новини Cloux'}).click();
 await page.locator('.chat-room').waitFor();
 assert.equal(await page.getByLabel('Голосовий дзвінок').count(),0,label+' read-only news allows call');
 assert.equal(await page.getByLabel('Відеодзвінок').count(),0,label+' read-only news allows video');
 await page.locator('.back-chat').click();
 await page.getByRole('button',{name:'Профіль'}).click();
 await page.locator('.settings-profile').waitFor();
 await page.getByText('Адмін-панель').click();
 await page.getByRole('heading',{name:'Адмін-панель'}).waitFor();
 await page.getByRole('button',{name:'Користувачі'}).last().click();
 await page.locator('.admin-user-list').getByText('Друг Cloux').waitFor();
 await page.getByRole('button',{name:'Канали'}).last().click();
 await page.getByRole('heading',{name:'Публічні групи й канали'}).waitFor();
 await page.setViewportSize({width:1280,height:800});
 assert.equal(await page.locator('.chat-sidebar').isVisible(),true);
 assert.equal(errors.length,0,label+' JavaScript errors: '+errors.join('; '));
 await browser.close();
 console.log(label+' responsive auth / admin / channel / dark theme: PASS');
}
await run(chromium,'Chrome mobile + desktop');
await run(webkit,'WebKit mobile + desktop');

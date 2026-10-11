import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'});
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
let chats=[
 {id:'notes',title:'Нотатки',kind:'saved',pinned:1,last_text:'Мої нотатки',last_time:1770000000},
 {id:'news',title:'Новини Cloux',kind:'news',last_text:'Вітаємо',last_time:1770000000},
 {id:'dm',title:'Стас',kind:'direct',other_id:'friend',last_text:'Привіт!',last_time:1770000000}];
const data={
 '/api/me':{id:'test-user',username:'test_user',display:'Тест Cloux',created:1770000000},
 '/api/preferences':{preferences:{theme:'dark',accent:'#F5F5F5',font_size:15,glass:1,wallpaper:'dots',wallpaper_blur:0,wallpaper_dim:12,show_previews:1,notify:1,searchable:1,bubble_style:'rounded',photo_version:0}},
 '/api/chats':{chats},
 '/api/chats/dm/messages':{messages:[{id:1,sender:'friend',display:'Стас',text:'Привіт! 😊',created:1770000000},{id:2,sender:'test-user',display:'Тест Cloux',text:'Вітаю ❤️',created:1770000001}]},
 '/api/chats/dm/reactions':{reactions:{}},
 '/api/chats/dm/read-status':{reads:{friend:2}},
 '/api/profile':{profile:{username:'test_user',display:'Тест Cloux',bio:'Статус',created:1770000000}},
 '/api/servers':{servers:[{id:'s',name:'Спільнота',description:'Тестова',role:'owner',member_count:2}]}
};
await page.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 const val=data[path]|| (path.endsWith('/messages')?{messages:[]}:path.endsWith('/reactions')?{reactions:{}}:path.endsWith('/read-status')?{reads:{}}:{ok:true});
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(val)});
});
await page.goto('http://127.0.0.1:8765/modern',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2200);
console.log('DEBUG PAGE', (await page.locator('body').innerText()).slice(0,800));
console.log('DEBUG ERRORS',errors);
await page.screenshot({path:'cloux-mobile-diagnostic.png'});
await page.locator('.chat-item').first().waitFor({timeout:8000});
assert.equal(await page.locator('.bottom-nav button').count(),5);
assert.equal(await page.locator('.chat-item').count(),3);
await page.locator('button[data-open-chat="dm"]').click();
await page.locator('.message').first().waitFor();
assert.equal(await page.locator('.message').count(),2);
assert.equal(await page.locator('.composer').count(),1);
await page.screenshot({path:'cloux-mobile-chat.png'});
await page.locator('[data-back]').click();
await page.locator('[data-nav="settings"]').click();
assert.equal(await page.locator('.bottom-nav').isVisible(),true);
await page.locator('#theme').waitFor();
await page.screenshot({path:'cloux-mobile-settings.png'});
await page.locator('[data-nav="profile"]').click();
await page.locator('#edit-avatar').waitFor();
assert.equal(await page.locator('.bottom-nav').isVisible(),true);
await page.screenshot({path:'cloux-mobile-profile.png'});
if(errors.length)throw new Error('Browser errors: '+errors.join(' | '));
console.log('Mobile Cloux UI smoke: passed');
await browser.close();
const VERSION="cloux-4-shell-v1";
const SHELL=["/assets/cloux-default-avatar.jpg","/ui/styles.css","/ui/core.js","/ui/emoji.js","/ui/avatar.js","/ui/calls.js","/ui/app.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=="GET"||u.origin!==self.location.origin||u.pathname.startsWith("/api/")||u.pathname.startsWith("/ws/"))return;
 if(e.request.mode==="navigate"){
  e.respondWith(fetch(e.request).catch(()=>new Response("<!doctype html><html lang='uk'><meta name='viewport' content='width=device-width,initial-scale=1'><body style='background:#080808;color:#fff;font:17px system-ui;padding:48px;text-align:center'><h2>Cloux зараз офлайн</h2><p>Перевір інтернет і спробуй ще раз.</p></body></html>",{headers:{"Content-Type":"text/html;charset=utf-8"}})));
  return;
 }
 if(SHELL.includes(u.pathname)){
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(VERSION).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
 }
});
/* Cloux service worker — network-first shell, never cache user/API messages. */
const CACHE='cloux-shell-v6.5.4';
const STATIC=['/v5/','/studio/','/download','/version.json','/manifest.json',
  '/studio/index.html','/studio/styles.css','/studio/app.js','/studio/media.js','/studio/calls.js',
  '/cloux-updates.js','/cloux-extras.js','/cloux-customize.js','/cloux-customize.css','/assets/cloux-default-avatar.jpg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(async cache=>{
    await Promise.all(STATIC.map(async url=>{
      try{const response=await fetch(new Request(url,{cache:'no-store'}));if(response.ok&&response.type==='basic')await cache.put(url,response)}
      catch{/* not all routes are reachable during first install; network-first retries later */}
    }));
  }));
});
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
  if(event.data?.type==='GET_VERSION')event.source?.postMessage({type:'VERSION',version:'6.5.4'});
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('cloux-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
function cacheable(request,url){
 if(request.method!=='GET'||url.origin!==self.location.origin)return false;
 if(/^(\/api\/|\/ws\/|\/apk\/?$|\/dmg\/?$|\/exe\/?$)/.test(url.pathname))return false;
 const dest=request.destination;
 return request.mode==='navigate'||['script','style','image','manifest'].includes(dest)||
  url.pathname==='/version.json'||url.pathname.endsWith('/app.js')||url.pathname.endsWith('/styles.css')||
  url.pathname.endsWith('/index.html');
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(!cacheable(request,url))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   const result=await fetch(request,{cache:'no-store'});
   if(result.ok&&result.type==='basic')event.waitUntil(cache.put(request,result.clone()));
   return result;
  }catch{
   const match=await cache.match(request,{ignoreSearch:true});
   if(match)return match;
   if(request.mode==='navigate')
    return new Response('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000"><body style="background:#000;color:#fff;font:17px system-ui;padding:36px;text-align:center"><h1>Cloux офлайн</h1><p>Підключися до інтернету, щоб відкрити свій акаунт і синхронізувати повідомлення.</p></body></html>',{headers:{'Content-Type':'text/html;charset=utf-8'}});
   return Response.error();
  }
 })());
});

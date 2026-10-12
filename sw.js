// Cloux PWA: only static shell assets are cached, never account or API responses.
const VERSION="cloux-v6-shell-20261012";
const CACHE_PREFIX="cloux-shell-";
const SHELL=["/v5/","/assets/cloux-official-192.jpg","/assets/cloux-official-512.jpg","/offline/"];
self.addEventListener("install", event=>{
 event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", event=>{
 event.waitUntil((async()=>{
   const names=await caches.keys();
   const upgraded=names.some(name=>name.startsWith(CACHE_PREFIX)&&name!==VERSION);
   await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX)&&name!==VERSION).map(name=>caches.delete(name)));
   await self.clients.claim();
   const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
   if(upgraded)for(const client of clients)client.postMessage({type:"CLOUX_UPDATED",version:VERSION});
 })());
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.startsWith("/api/")||url.pathname.startsWith("/ws/"))return;
 if(request.mode==="navigate"){
   event.respondWith(fetch(request).catch(()=>caches.match("/offline/")));
   return;
 }
 if(url.pathname.startsWith("/v5/assets/")||url.pathname.startsWith("/assets/")){
   event.respondWith((async()=>{
     const cache=await caches.open(VERSION);
     const cached=await cache.match(request);
     if(cached)return cached;
     const response=await fetch(request);
     if(response.ok)void cache.put(request,response.clone());
     return response;
   })());
 }
});

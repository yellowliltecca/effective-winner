/* SGU 111 offline cache. Scoped exclusively to this GitHub Pages project. */
const VERSION='sgu111-offline-20261102-v5';
const CORE=['./','./index.html','./features.js','./student-tools.js','./design.css','./attendance.js','./attendance.css','./search.js','./search.css','./session.js','./session.css','./data/teacher-groups.json','./manifest.webmanifest','./icon.svg','./data/schedule.json'];
const coreURL=u=>new URL(u,self.registration.scope).href;
const isLocal=url=>url.origin===self.location.origin&&url.pathname.startsWith(new URL(self.registration.scope).pathname);
const known=url=>CORE.some(x=>coreURL(x).split('?')[0]===url.split('?')[0]);
async function preCache(){
 const cache=await caches.open(VERSION);
 await Promise.allSettled(CORE.map(async name=>{const request=new Request(coreURL(name),{cache:'reload'});const response=await fetch(request);if(response.ok)await cache.put(coreURL(name),response.clone())}));
}
self.addEventListener('install',event=>{event.waitUntil(preCache().then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('sgu111-offline-')&&k!==VERSION).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('message',event=>{if(event.data?.type==='CACHE_CORE')event.waitUntil(preCache())});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(!isLocal(url))return;
 const isDocument=request.mode==='navigate',isSchedule=url.pathname.endsWith('/data/schedule.json');
 if(isSchedule){
  event.respondWith((async()=>{const cache=await caches.open(VERSION);try{const fresh=await fetch(new Request(request,{cache:'no-store'}));if(fresh.ok){await cache.put(coreURL('./data/schedule.json'),fresh.clone());return fresh}throw Error('No response')}catch{const copy=await cache.match(coreURL('./data/schedule.json'));return copy||new Response(JSON.stringify({error:'No cached schedule'}),{status:503,headers:{'Content-Type':'application/json'}})}})());
  return;
 }
 if(isDocument){
  event.respondWith((async()=>{const cache=await caches.open(VERSION);try{const fresh=await fetch(request);if(fresh.ok){await cache.put(coreURL('./index.html'),fresh.clone());return fresh}throw Error('offline')}catch{return await cache.match(coreURL('./index.html'))||Response.error()}})());
  return;
 }
 event.respondWith((async()=>{const cache=await caches.open(VERSION);const key=known(request.url)?coreURL(url.pathname.endsWith('/index.html')?'./index.html':'./'+url.pathname.slice(new URL(self.registration.scope).pathname.length)):request;const saved=await cache.match(key);
 if(saved){event.waitUntil(fetch(request).then(r=>{if(r.ok)return cache.put(key,r.clone())}).catch(()=>{}));return saved}
 try{const fresh=await fetch(request);if(fresh.ok)await cache.put(key,fresh.clone());return fresh}catch{return Response.error()}
 })());
});
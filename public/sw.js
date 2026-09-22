const CACHE_VERSION='nestbalance-shell-v1';
const SHELL_CACHE='nestbalance-shell-'+CACHE_VERSION;
const STATIC_CACHE='nestbalance-static-'+CACHE_VERSION;
const PUBLIC_ASSETS=['/','/manifest.webmanifest','/nestbalance-icon.svg','/nestbalance-logo.svg'];

function sameOrigin(url){
  return url.origin===self.location.origin;
}
function isApi(url){
  return sameOrigin(url)&&url.pathname.startsWith('/api/');
}
function isStaticAsset(url){
  if(!sameOrigin(url)) return false;
  return url.pathname.startsWith('/_next/static/')
    || PUBLIC_ASSETS.includes(url.pathname)
    || /\.(?:css|js|woff2?|png|svg|webp|ico)$/.test(url.pathname);
}
async function warmShell(){
  const cache=await caches.open(SHELL_CACHE);
  try{
    const response=await fetch('/',{cache:'no-store'});
    if(response.ok){
      await cache.put('/',response.clone());
      const html=await response.text();
      const urls=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map(match=>match[1])
        .filter(value=>{
          try{
            const url=new URL(value,self.location.origin);
            return isStaticAsset(url)&&!isApi(url);
          }catch{
            return false;
          }
        });
      const unique=[...new Set([...PUBLIC_ASSETS,...urls])];
      await Promise.all(unique.map(async value=>{
        try{
          const url=new URL(value,self.location.origin);
          if(isApi(url)||!sameOrigin(url)) return;
          const asset=await fetch(url,{cache:'no-store'});
          if(asset.ok) await cache.put(url,asset);
        }catch{}
      }));
    }
  }catch{}
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    await warmShell();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys
      .filter(key=>key.startsWith('nestbalance-')&&key!==SHELL_CACHE&&key!==STATIC_CACHE)
      .map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);

  // Financial/private API responses are always network-only and never cached.
  if(isApi(url)){
    event.respondWith(fetch(request));
    return;
  }

  if(request.mode==='navigate'&&sameOrigin(url)){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response.ok){
          const cache=await caches.open(SHELL_CACHE);
          await cache.put(request,response.clone());
        }
        return response;
      }catch{
        const cache=await caches.open(SHELL_CACHE);
        return (await cache.match(request))
          || (await cache.match('/'))
          || Response.error();
      }
    })());
    return;
  }

  if(isStaticAsset(url)){
    event.respondWith((async()=>{
      const cache=await caches.open(STATIC_CACHE);
      const cached=await cache.match(request);
      if(cached) return cached;
      const response=await fetch(request);
      if(response.ok) await cache.put(request,response.clone());
      return response;
    })());
  }
});

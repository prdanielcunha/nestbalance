const CACHE_VERSION='v1';
const SHELL_CACHE='nestbalance-shell-'+CACHE_VERSION;
const STATIC_CACHE='nestbalance-static-'+CACHE_VERSION;
const SHARE_CACHE='nestbalance-share-target-v1';
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
          if(asset.ok) await cache.put(url.toString(),asset);
        }catch{}
      }));
    }
  }catch{}
}


async function handleShareTarget(request){
  const form=await request.formData();
  const id=(self.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2));
  const title=String(form.get('title')||'');
  const text=String(form.get('text')||'');
  const url=String(form.get('url')||'');
  const files=form.getAll('files').filter(value=>value instanceof Blob);
  const cache=await caches.open(SHARE_CACHE);
  await cache.put(
    new URL('/__share/meta/'+encodeURIComponent(id),self.location.origin).toString(),
    new Response(JSON.stringify({title,text,url,count:files.length}),{headers:{'content-type':'application/json','cache-control':'no-store'}})
  );
  for(let index=0;index<files.length;index++){
    const file=files[index];
    const name=typeof file.name==='string'&&file.name?file.name:`compartilhado-${index+1}`;
    await cache.put(
      new URL('/__share/file/'+encodeURIComponent(id)+'/'+index,self.location.origin).toString(),
      new Response(file,{headers:{
        'content-type':file.type||'application/octet-stream',
        'cache-control':'no-store',
        'x-nestbalance-file-name':encodeURIComponent(name)
      }})
    );
  }
  return Response.redirect('/add?shareTarget='+encodeURIComponent(id),303);
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
      .filter(key=>key.startsWith('nestbalance-')&&key!==SHELL_CACHE&&key!==STATIC_CACHE&&key!==SHARE_CACHE)
      .map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(request.method==='POST'&&sameOrigin(url)&&url.pathname==='/share-target'){
    event.respondWith(handleShareTarget(request));
    return;
  }
  if(request.method!=='GET') return;

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
      const shell=await caches.open(SHELL_CACHE);
      const cached=(await cache.match(request))||(await shell.match(request));
      if(cached) return cached;
      const response=await fetch(request);
      if(response.ok) await cache.put(request,response.clone());
      return response;
    })());
  }
});

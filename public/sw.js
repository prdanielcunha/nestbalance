const CACHE_VERSION='v1';
const SHELL_CACHE='nestbalance-shell-'+CACHE_VERSION;
const STATIC_CACHE='nestbalance-static-'+CACHE_VERSION;
const PUBLIC_ASSETS=['/','/manifest.webmanifest','/nestbalance-icon.svg','/nestbalance-logo.svg'];
const SHARE_CACHE='nestbalance-share-v1';

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

function sharePath(id,suffix='meta'){
  return '/__nestbalance-share/'+id+'/'+suffix;
}

async function receiveShare(request){
  try{
    const form=await request.formData();
    const id=(self.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g,'');
    const title=String(form.get('title')||'').slice(0,500);
    const text=String(form.get('text')||'').slice(0,20_000);
    const sharedUrl=String(form.get('url')||'').slice(0,2_000);
    const files=form.getAll('files').filter(value=>value instanceof File).slice(0,3);
    const cache=await caches.open(SHARE_CACHE);
    const fileMeta=[];
    for(let index=0;index<files.length;index++){
      const file=files[index];
      fileMeta.push({index,name:file.name||('shared-'+index),type:file.type||'application/octet-stream',size:file.size});
      await cache.put(sharePath(id,'file-'+index),new Response(file,{headers:{
        'content-type':file.type||'application/octet-stream',
        'x-nestbalance-file-name':encodeURIComponent(file.name||('shared-'+index)),
        'cache-control':'no-store'
      }}));
    }
    await cache.put(sharePath(id),new Response(JSON.stringify({title,text,url:sharedUrl,files:fileMeta}),{
      headers:{'content-type':'application/json','cache-control':'no-store'}
    }));
    return Response.redirect(new URL('/add?shareTarget='+encodeURIComponent(id),self.location.origin).toString(),303);
  }catch{
    return Response.redirect(new URL('/add?shareError=1',self.location.origin).toString(),303);
  }
}

async function clearShare(id){
  const cache=await caches.open(SHARE_CACHE);
  const keys=await cache.keys();
  await Promise.all(keys.filter(request=>new URL(request.url).pathname.startsWith('/__nestbalance-share/'+id+'/')).map(request=>cache.delete(request)));
  return new Response(null,{status:204});
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(sameOrigin(url)&&url.pathname==='/share-target'&&request.method==='POST'){
    event.respondWith(receiveShare(request));
    return;
  }
  if(sameOrigin(url)&&url.pathname.startsWith('/__nestbalance-share/')){
    const parts=url.pathname.split('/').filter(Boolean);
    const id=parts[1]||'';
    if(request.method==='DELETE'&&id){
      event.respondWith(clearShare(id));
      return;
    }
    if(request.method==='GET'){
      event.respondWith((async()=>{
        const cache=await caches.open(SHARE_CACHE);
        return (await cache.match(request))||new Response('Not found',{status:404});
      })());
      return;
    }
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

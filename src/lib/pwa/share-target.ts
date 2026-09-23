'use client';

const SHARE_CACHE='nestbalance-share-target-v1';

export type SharedTargetPayload={
  title:string;
  text:string;
  url:string;
  file:File|null;
  fileCount:number;
};

function metaUrl(id:string){
  return new URL(`/__share/meta/${encodeURIComponent(id)}`,window.location.origin).toString();
}

function fileUrl(id:string,index:number){
  return new URL(`/__share/file/${encodeURIComponent(id)}/${index}`,window.location.origin).toString();
}

export async function consumeWebShareTarget(id:string):Promise<SharedTargetPayload|null>{
  if(typeof window==='undefined'||!('caches' in window)||!id) return null;
  const cache=await caches.open(SHARE_CACHE);
  const metaResponse=await cache.match(metaUrl(id));
  if(!metaResponse) return null;

  const meta=await metaResponse.json().catch(()=>null) as {title?:unknown;text?:unknown;url?:unknown;count?:unknown}|null;
  if(!meta) return null;

  const count=Number.isInteger(meta.count)&&Number(meta.count)>0?Number(meta.count):0;
  let file:File|null=null;
  if(count>0){
    const response=await cache.match(fileUrl(id,0));
    if(response){
      const blob=await response.blob();
      const encodedName=response.headers.get('x-nestbalance-file-name')||'';
      let name='compartilhado';
      try{name=encodedName?decodeURIComponent(encodedName):name;}catch{}
      file=new File([blob],name,{type:blob.type||response.headers.get('content-type')||'application/octet-stream'});
    }
  }

  await cache.delete(metaUrl(id));
  for(let index=0;index<count;index++) await cache.delete(fileUrl(id,index));

  return {
    title:typeof meta.title==='string'?meta.title:'',
    text:typeof meta.text==='string'?meta.text:'',
    url:typeof meta.url==='string'?meta.url:'',
    file,
    fileCount:count
  };
}

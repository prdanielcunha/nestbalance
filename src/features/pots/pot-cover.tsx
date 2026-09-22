'use client';
import { useEffect, useState } from 'react';
import { getSavingsPotCover } from '@/src/lib/repositories/savings-pots';

export function SavingsPotCover({
  householdId,
  potId,
  name,
  hasCover,
  coverVersion,
  className=''
}:{
  householdId:string;
  potId:string;
  name:string;
  hasCover:boolean;
  coverVersion:number|null;
  className?:string;
}){
  const [url,setUrl]=useState<string|null>(null);
  useEffect(()=>{
    if(!hasCover){
      setUrl(current=>{if(current) URL.revokeObjectURL(current);return null;});
      return;
    }
    let cancelled=false;
    let objectUrl:string|null=null;
    void getSavingsPotCover(householdId,potId)
      .then(blob=>{
        if(cancelled) return;
        objectUrl=URL.createObjectURL(blob);
        setUrl(current=>{
          if(current) URL.revokeObjectURL(current);
          return objectUrl;
        });
      })
      .catch(()=>{ if(!cancelled) setUrl(null); });
    return ()=>{
      cancelled=true;
      if(objectUrl) URL.revokeObjectURL(objectUrl);
    };
  },[householdId,potId,hasCover,coverVersion]);

  return <div className={`savings-pot-cover ${!url?'is-empty ':''}${className}`.trim()} aria-hidden="true">
    {url?<img src={url} alt="" />:null}
  </div>;
}

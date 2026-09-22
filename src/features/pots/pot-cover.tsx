'use client';
import { useEffect, useMemo, useState } from 'react';
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
  const initials=useMemo(()=>{
    const words=name.trim().split(/\s+/).filter(Boolean);
    if(!words.length) return 'NB';
    return (words.length===1?words[0].slice(0,2):words[0][0]+words.at(-1)![0]).toLocaleUpperCase('pt-BR');
  },[name]);

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

  return <div className={`savings-pot-cover ${className}`.trim()} aria-hidden="true">
    {url?<img src={url} alt="" />:<span>{initials}</span>}
  </div>;
}

'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';

const STORAGE_KEY='nestbalance-values-hidden-v1';
const ITEMS_KEY='nestbalance-values-hidden-items-v1';
const ValuesVisibilityContext=createContext({hidden:false,allHidden:false,isHidden:(_id:string):boolean=>false,toggleValue:(_id:string)=>{},toggleAll:()=>{}});
function readHiddenItems():Record<string,boolean>{
  try{
    const ids:unknown=JSON.parse(localStorage.getItem(ITEMS_KEY)||'[]');
    return Array.isArray(ids)?Object.fromEntries(ids.filter(id=>typeof id==='string'&&id.length<=400).slice(-500).map(id=>[id,true])):{};
  }catch{return {};}
}
export function ValuesVisibilityProvider({children}:{children:ReactNode}){
  // Mask before loading preferences so a private screen never flashes values.
  const [hidden,setHidden]=useState(true);
  const [overrides,setOverrides]=useState<Record<string,boolean>>({});
  useEffect(()=>{
    function load(){
      try{setHidden(localStorage.getItem(STORAGE_KEY)==='true');}catch{setHidden(false);}
      setOverrides(readHiddenItems());
    }
    load();
    const sync=(event:StorageEvent)=>{if(event.key===STORAGE_KEY||event.key===ITEMS_KEY||event.key===null) load();};
    window.addEventListener('storage',sync);
    return ()=>window.removeEventListener('storage',sync);
  },[]);
  const isHidden=useCallback((id:string)=>overrides[id]??hidden,[overrides,hidden]);
  const allHidden=hidden&&Object.values(overrides).every(Boolean);
  const toggleValue=useCallback((id:string)=>{
    const next={...overrides,[id]:!(overrides[id]??hidden)};
    setOverrides(next);
    // Keep individual hides; reveals while globally hidden are session-only.
    try{localStorage.setItem(ITEMS_KEY,JSON.stringify(Object.keys(next).filter(key=>next[key]).slice(-500)));}catch{}
  },[overrides,hidden]);
  const toggleAll=useCallback(()=>{
    const next=!allHidden;
    setHidden(next);setOverrides({});
    try{localStorage.setItem(STORAGE_KEY,String(next));localStorage.removeItem(ITEMS_KEY);}catch{}
  },[allHidden]);
  const value=useMemo(()=>({hidden,allHidden,isHidden,toggleValue,toggleAll}),[hidden,allHidden,isHidden,toggleValue,toggleAll]);
  return <ValuesVisibilityContext.Provider value={value}>{children}</ValuesVisibilityContext.Provider>;
}
export function useValuesVisibility(){return useContext(ValuesVisibilityContext);}

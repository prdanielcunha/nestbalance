'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';

const STORAGE_KEY='nestbalance-values-hidden-v1';
const ValuesVisibilityContext=createContext({hidden:false,allHidden:false,isHidden:(_id:string):boolean=>false,toggleValue:(_id:string)=>{},toggleAll:()=>{}});

export function ValuesVisibilityProvider({children}:{children:ReactNode}){
  // Mask before loading the preference so a private screen never flashes values.
  const [hidden,setHidden]=useState(true);
  const [overrides,setOverrides]=useState<Record<string,boolean>>({});
  useEffect(()=>{
    try{setHidden(localStorage.getItem(STORAGE_KEY)==='true');}catch{setHidden(false);}
    const sync=(event:StorageEvent)=>{if(event.key===STORAGE_KEY){setHidden(event.newValue==='true');setOverrides({});}};
    window.addEventListener('storage',sync);
    return ()=>window.removeEventListener('storage',sync);
  },[]);
  const isHidden=useCallback((id:string)=>overrides[id]??hidden,[overrides,hidden]);
  const allHidden=hidden&&Object.values(overrides).every(Boolean);
  const toggleValue=useCallback((id:string)=>setOverrides(current=>({...current,[id]:!(current[id]??hidden)})),[hidden]);
  const toggleAll=useCallback(()=>{
    const next=!allHidden;
    setHidden(next);setOverrides({});
    try{localStorage.setItem(STORAGE_KEY,String(next));}catch{}
  },[allHidden]);
  const value=useMemo(()=>({hidden,allHidden,isHidden,toggleValue,toggleAll}),[hidden,allHidden,isHidden,toggleValue,toggleAll]);
  return <ValuesVisibilityContext.Provider value={value}>{children}</ValuesVisibilityContext.Provider>;
}
export function useValuesVisibility(){return useContext(ValuesVisibilityContext);}

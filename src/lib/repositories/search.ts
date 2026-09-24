'use client';
import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';

export type UniversalSearchResult={
  id:string;
  type:'movement'|'commitment'|'account'|'pot'|'document';
  label:string;
  secondary?:string|null;
  href:string;
};

export async function searchHousehold(householdId:string,query:string){
  const token=await getBrowserAuthToken();
  const response=await fetch('/api/search',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({householdId,query}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'UNIVERSAL_SEARCH_FAILED');
  return json as {ok:true;results:UniversalSearchResult[]};
}

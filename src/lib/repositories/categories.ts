'use client';
import { auth } from '@/src/lib/firebase/client';
import type { SpendingCategory } from '@/src/core/insights';

async function token(){
  const value=await auth?.currentUser?.getIdToken();
  if(!value) throw new Error('AUTH_REQUIRED');
  return value;
}

export async function updateTransactionCategory(input:{
  householdId:string;
  transactionId:string;
  category:SpendingCategory;
  rememberForSimilar:boolean;
}){
  const response=await fetch('/api/categories/transaction',{
    method:'POST',
    headers:{
      authorization:`Bearer ${await token()}`,
      'content-type':'application/json'
    },
    body:JSON.stringify(input)
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'CATEGORY_UPDATE_FAILED');
  return json as {ok:true;transactionId:string;category:SpendingCategory;rememberForSimilar:boolean};
}

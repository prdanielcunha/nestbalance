import type { Request, Response } from 'express';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { visibleDocs } from './privacy.js';
import { searchRecords, type SearchableRecord } from '../src/core/search.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

export async function universalSearch(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const query=String(req.body?.query||'').trim();
    await requireHouseholdMember(householdId,user.uid,'read');
    if(query.length<2||query.length>100) return error(res,400,'INVALID_SEARCH_QUERY');

    const household=adminDb.collection('households').doc(householdId);
    const [transactions,commitments,accounts,pots,evidence]=await Promise.all([
      household.collection('transactions').orderBy('createdAt','desc').limit(500).get(),
      household.collection('commitments').orderBy('createdAt','desc').limit(300).get(),
      household.collection('accounts').limit(100).get(),
      household.collection('savingsPots').limit(150).get(),
      household.collection('evidenceAssets').orderBy('createdAt','desc').limit(150).get()
    ]);

    const records:SearchableRecord[]=[];
    for(const doc of visibleDocs(transactions.docs,user.uid)){
      const data=doc.data();
      records.push({id:doc.id,type:'movement',label:String(data.description||'Movimento'),secondary:String(data.observedOn||''),keywords:[String(data.category||''),String(data.source||'')]});
    }
    for(const doc of visibleDocs(commitments.docs,user.uid)){
      const data=doc.data();
      records.push({id:doc.id,type:'commitment',label:String(data.description||'Conta'),secondary:data.dueDay?`dia ${data.dueDay}`:'',keywords:[String(data.recurrence||''),String(data.category||'')]});
    }
    for(const doc of visibleDocs(accounts.docs,user.uid)){
      const data=doc.data();
      records.push({id:doc.id,type:'account',label:String(data.name||'Conta'),secondary:String(data.institutionName||''),keywords:[String(data.type||''),String(data.connectedProductType||'')]});
    }
    for(const doc of visibleDocs(pots.docs,user.uid)){
      const data=doc.data();
      records.push({id:doc.id,type:'pot',label:String(data.name||'Cofrinho'),secondary:String(data.institutionName||''),keywords:['cofrinho','meta']});
    }
    for(const doc of visibleDocs(evidence.docs,user.uid)){
      const data=doc.data();
      records.push({id:doc.id,type:'document',label:String(data.originalName||'Documento'),secondary:String(data.declaredMimeType||data.mimeType||''),keywords:['documento','arquivo']});
    }

    const results=searchRecords(records,query,24).map(item=>({
      ...item,
      href:item.type==='movement'?'/movements':item.type==='commitment'?'/':item.type==='account'?'/accounts':item.type==='pot'?'/pots':'/documents'
    }));
    return res.json({ok:true,results});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'UNIVERSAL_SEARCH_FAILED');
  }
}

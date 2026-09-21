import type { Request, Response } from 'express';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { canAccessScopedRecord } from '../src/core/privacy.js';
import { deleteBelvoLink } from './open-finance/belvo.js';

const PRIVACY_VERSION='nestbalance-privacy-v1';
const EXPORT_COLLECTIONS=[
  'accounts','creditCards','transactions','commitments','installmentPlans','invoiceImports',
  'commitmentPayments','savingsPots','cardSnapshots','evidenceAssets','bankConnections'
] as const;
const PERSONAL_DELETE_COLLECTIONS=[
  'transactions','commitments','commitmentPayments','installmentPlans','invoiceImports',
  'accounts','creditCards','savingsPots','cardSnapshots','evidenceAssets'
] as const;

function error(res:Response,status:number,code:string){ return res.status(status).json({ok:false,error:code}); }
function asJson(value:any):any{
  if(value===null||value===undefined) return value??null;
  if(typeof value?.toDate==='function') return value.toDate().toISOString();
  if(value instanceof Date) return value.toISOString();
  if(Array.isArray(value)) return value.map(asJson);
  if(typeof value==='object'){
    const out:Record<string,any>={};
    for(const [key,item] of Object.entries(value)) out[key]=asJson(item);
    return out;
  }
  return value;
}
function sanitize(collection:string,data:any){
  const copy={...asJson(data)};
  if(collection==='evidenceAssets'){ delete copy.storagePath; delete copy.uploadPath; }
  if(collection==='bankConnections'){ delete copy.linkId; delete copy.externalId; }
  return copy;
}
function personalOwned(data:any,uid:string){ return data?.scope==='personal'&&data?.ownerUid===uid; }

async function allDocs(ref:FirebaseFirestore.CollectionReference){
  const out:FirebaseFirestore.QueryDocumentSnapshot[]=[];
  let cursor:FirebaseFirestore.QueryDocumentSnapshot|null=null;
  for(;;){
    let query:FirebaseFirestore.Query=ref.orderBy(FieldPath.documentId()).limit(500);
    if(cursor) query=query.startAfter(cursor);
    const snap=await query.get();
    if(snap.empty) break;
    out.push(...snap.docs);
    cursor=snap.docs[snap.docs.length-1];
    if(snap.size<500) break;
  }
  return out;
}

async function actorAuditEvents(householdRef:FirebaseFirestore.DocumentReference,uid:string){
  const docs=await allDocs(householdRef.collection('auditEvents'));
  return docs.filter(doc=>String(doc.data()?.actorUid||'')===uid);
}


export async function getPrivacyStatus(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const member=await requireHouseholdMember(householdId,user.uid,'read');
    const consent=await adminDb.doc('users/'+user.uid+'/consents/'+PRIVACY_VERSION).get();
    return res.json({
      ok:true,privacyVersion:PRIVACY_VERSION,accepted:consent.exists&&consent.data()?.accepted===true,
      acceptedAt:consent.data()?.acceptedAt?.toDate?.()?.toISOString?.()??null,role:member.role,
      purposes:['organizar sua vida financeira','preservar evidências que você enviar','calcular previsões e reconciliações autorizadas'],
      retention:{financial:'Enquanto o Lar existir ou até exclusão solicitada.',invites:'7 dias.',personal:'Pode ser excluído separadamente pelo dono dos itens.'}
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PRIVACY_STATUS_FAILED');
  }
}

export async function recordPrivacyConsent(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    const ref=adminDb.doc('users/'+user.uid+'/consents/'+PRIVACY_VERSION);
    await ref.set({accepted:true,version:PRIVACY_VERSION,acceptedAt:FieldValue.serverTimestamp(),householdId},{merge:true});
    await adminDb.collection('users').doc(user.uid).collection('privacyEvents').add({
      type:'privacy.consent_recorded',version:PRIVACY_VERSION,householdId,createdAt:FieldValue.serverTimestamp()
    });
    return res.json({ok:true,privacyVersion:PRIVACY_VERSION});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PRIVACY_CONSENT_FAILED');
  }
}

export async function exportPrivacyData(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const mode=req.body?.mode==='personal'?'personal':'accessible';
    const member=await requireHouseholdMember(householdId,user.uid,'read');
    const householdRef=adminDb.collection('households').doc(householdId);
    const householdSnap=await householdRef.get();
    if(!householdSnap.exists) return error(res,404,'HOUSEHOLD_NOT_FOUND');

    const result:Record<string,any[]>={};
    for(const collection of EXPORT_COLLECTIONS){
      const docs=await allDocs(householdRef.collection(collection));
      result[collection]=docs
        .filter(doc=>mode==='personal'?personalOwned(doc.data(),user.uid):canAccessScopedRecord(doc.data(),user.uid))
        .map(doc=>({id:doc.id,...sanitize(collection,doc.data())}));
    }

    const ownAudit=await actorAuditEvents(householdRef,user.uid);
    result.activity=ownAudit.map(doc=>({id:doc.id,...sanitize('auditEvents',doc.data())}));

    await householdRef.collection('auditEvents').add({
      type:'privacy.exported',scope:mode==='personal'?'personal':'household',ownerUid:mode==='personal'?user.uid:null,
      actorUid:user.uid,mode,createdAt:FieldValue.serverTimestamp()
    });
    const payload={
      product:'NestBalance',formatVersion:1,privacyVersion:PRIVACY_VERSION,exportedAt:new Date().toISOString(),
      mode,user:{uid:user.uid,email:user.email||null},
      household:{id:householdId,name:String(householdSnap.data()?.name||'Meu Lar'),role:member.role},
      note:'Arquivos originais continuam disponíveis pelo Cofre autenticado; este arquivo contém dados estruturados e metadados.',
      data:result
    };
    const stamp=new Date().toISOString().slice(0,10);
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="nestbalance-${mode}-${stamp}.json"`);
    return res.status(200).send(JSON.stringify(payload,null,2));
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PRIVACY_EXPORT_FAILED');
  }
}

async function deleteRefs(refs:FirebaseFirestore.DocumentReference[]){
  for(const ref of refs) await (adminDb as any).recursiveDelete(ref);
}

export async function deletePersonalData(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    if(String(req.body?.confirmation||'')!=='DELETE_MY_PERSONAL_DATA') return error(res,400,'PERSONAL_DELETE_CONFIRMATION_REQUIRED');
    const household=adminDb.collection('households').doc(householdId);
    const byCollection:Record<string,FirebaseFirestore.QueryDocumentSnapshot[]>={};
    const deletedIds=new Set<string>();
    const evidencePaths:string[]=[];

    for(const collection of PERSONAL_DELETE_COLLECTIONS){
      const docs=(await allDocs(household.collection(collection))).filter(doc=>personalOwned(doc.data(),user.uid));
      byCollection[collection]=docs;
      for(const doc of docs){
        deletedIds.add(doc.id);
        if(collection==='evidenceAssets'){
          const path=String(doc.data().storagePath||doc.data().uploadPath||'');
          if(path) evidencePaths.push(path);
        }
      }
    }

    for(const path of evidencePaths) await adminBucket.file(path).delete({ignoreNotFound:true}).catch(()=>undefined);
    for(const docs of Object.values(byCollection)) await deleteRefs(docs.map(doc=>doc.ref));

    const auditDocs=await allDocs(household.collection('auditEvents'));
    const personalAudit=auditDocs.filter(doc=>{
      const data=doc.data();
      if(data.scope==='personal'&&data.ownerUid===user.uid) return true;
      const linked=[
        data.entityId,data.evidenceId,data.canonicalEvidenceId,data.transactionId,data.paymentTransactionId,
        data.commitmentId,data.cardId,data.accountId,data.invoiceImportId
      ].map(value=>String(value||'')).filter(Boolean);
      return linked.some(id=>deletedIds.has(id));
    });
    await deleteRefs(personalAudit.map(doc=>doc.ref));

    const indexCollections=['captureFingerprints','accountKeys','creditCardKeys','evidenceHashes','invoiceItemKeys','invoicePaymentKeys'];
    const batch=adminDb.batch(); let batchOps=0;
    for(const collection of indexCollections){
      const docs=await allDocs(household.collection(collection));
      for(const doc of docs){
        const data=doc.data();
        const linked=[data.entityId,data.accountId,data.cardId,data.evidenceId,data.transactionId,data.invoiceImportId].map(String);
        if(linked.some(id=>deletedIds.has(id))){ batch.delete(doc.ref); batchOps++; }
      }
    }
    if(batchOps) await batch.commit();

    await adminDb.collection('users').doc(user.uid).collection('privacyEvents').add({
      type:'privacy.personal_data_deleted',householdId,counts:{...Object.fromEntries(Object.entries(byCollection).map(([k,v])=>[k,v.length])),auditEvents:personalAudit.length},createdAt:FieldValue.serverTimestamp()
    });
    return res.json({ok:true,counts:{...Object.fromEntries(Object.entries(byCollection).map(([k,v])=>[k,v.length])),auditEvents:personalAudit.length}});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PERSONAL_DATA_DELETE_FAILED');
  }
}

export async function deleteHousehold(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const member=await requireHouseholdMember(householdId,user.uid,'owner');
    if(member.role!=='owner') return error(res,403,'HOUSEHOLD_OWNER_REQUIRED');
    const householdRef=adminDb.collection('households').doc(householdId);
    const householdSnap=await householdRef.get();
    if(!householdSnap.exists) return error(res,404,'HOUSEHOLD_NOT_FOUND');
    const name=String(householdSnap.data()?.name||'Meu Lar');
    if(String(req.body?.confirmation||'')!==name) return error(res,400,'HOUSEHOLD_DELETE_CONFIRMATION_REQUIRED');

    const connections=await allDocs(householdRef.collection('bankConnections'));
    for(const doc of connections){
      const data=doc.data();
      if(String(data.status||'')==='disconnected') continue;
      const linkId=String(data.linkId||'');
      if(linkId){
        try{ await deleteBelvoLink(linkId); }
        catch{ return error(res,409,'OPEN_FINANCE_REVOCATION_FAILED'); }
      }
    }

    const members=await allDocs(householdRef.collection('members'));
    const memberUids=members.map(doc=>doc.id);
    await adminBucket.deleteFiles({prefix:'nestbalance/households/'+householdId+'/'}).catch(()=>undefined);
    await (adminDb as any).recursiveDelete(householdRef);

    for(const uid of memberUids){
      const userRef=adminDb.collection('users').doc(uid);
      const userSnap=await userRef.get();
      const batch=adminDb.batch();
      batch.delete(userRef.collection('householdRefs').doc(householdId));
      if(String(userSnap.data()?.activeHouseholdId||'')===householdId) batch.set(userRef,{activeHouseholdId:FieldValue.delete()},{merge:true});
      if(uid===user.uid) batch.set(userRef.collection('privacyEvents').doc(),{
        type:'privacy.household_deleted',householdId,householdName:name,createdAt:FieldValue.serverTimestamp()
      });
      await batch.commit();
    }
    return res.json({ok:true,deletedHouseholdId:householdId});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_DELETE_FAILED');
  }
}

import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  decimalToMinor,
  institutionFor,
  isSafeOpenFinanceOrigin,
  isValidCpf,
  mapBelvoAccountType,
  normalizeCpf,
  normalizeLegalName
} from '../src/core/open-finance.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import {
  createBelvoWidgetAccess,
  deleteBelvoLink,
  getBelvoLink,
  isBelvoConfigured,
  paidOpenFinanceEnabled,
  listBelvoAccounts,
  listBelvoBalances,
  listBelvoTransactions
} from './open-finance/belvo.js';

const SESSION_TTL_MS=15*60*1000;

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function fail(code:string,statusCode:number):never{
  throw Object.assign(new Error(code),{statusCode});
}

function safeProviderError(err:any){
  const known=[
    'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED',
    'INVALID_OPEN_FINANCE_IDENTITY','INVALID_OPEN_FINANCE_ORIGIN',
    'OPEN_FINANCE_NOT_CONFIGURED','OPEN_FINANCE_SESSION_NOT_FOUND',
    'OPEN_FINANCE_SESSION_EXPIRED','OPEN_FINANCE_LINK_INVALID',
    'OPEN_FINANCE_LINK_MISMATCH','OPEN_FINANCE_CONNECTION_NOT_FOUND'
  ];
  return known.includes(err?.message)?err.message:'OPEN_FINANCE_PROVIDER_ERROR';
}

function allowedOrigin(raw:unknown){
  const origin=String(raw||'');
  if(isSafeOpenFinanceOrigin(origin)) return origin.replace(/\/$/,'');
  fail('INVALID_OPEN_FINANCE_ORIGIN',400);
}

function validUuid(value:string){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hash(value:string){
  return createHash('sha256').update(value).digest('hex');
}

function linkExternalId(link:any){
  return String(link?.external_id??link?.externalId??'');
}

function linkInstitution(link:any){
  const value=link?.institution;
  if(typeof value==='string') return value;
  return String(value?.name??value?.display_name??'');
}

function institutionLabel(code:string){
  const lower=code.toLowerCase();
  if(lower.includes('mercadopago')) return 'Mercado Pago';
  if(lower.includes('nubank')) return 'Nubank';
  if(lower.includes('itau')) return 'Itaú';
  if(lower.includes('santander')) return 'Santander';
  return code||'Instituição conectada';
}

function balanceMap(items:any[]){
  const map=new Map<string,any>();
  for(const item of items){
    const keys=[
      String(item?.account_id||''),
      String(item?.account_internal_identification||'')
    ].filter(Boolean);
    for(const key of keys){
      const current=map.get(key);
      const at=String(item?.last_updated_at||item?.collected_at||'');
      const currentAt=String(current?.last_updated_at||current?.collected_at||'');
      if(!current||at>currentAt) map.set(key,item);
    }
  }
  return map;
}

async function syncConnection(householdId:string,connectionId:string,actorUid:string){
  if(!paidOpenFinanceEnabled()) fail('OPEN_FINANCE_NOT_CONFIGURED',503);
  const household=adminDb.collection('households').doc(householdId);
  const connectionRef=household.collection('bankConnections').doc(connectionId);
  const connectionSnap=await connectionRef.get();
  if(!connectionSnap.exists) fail('OPEN_FINANCE_CONNECTION_NOT_FOUND',404);
  const connection=connectionSnap.data()!;
  const linkId=String(connection.linkId||'');
  if(!validUuid(linkId)) fail('OPEN_FINANCE_LINK_INVALID',409);

  const [accounts,balances,transactions]=await Promise.all([
    listBelvoAccounts(linkId),
    listBelvoBalances(linkId).catch(()=>[]),
    listBelvoTransactions(linkId).catch(()=>[])
  ]);
  const balancesByAccount=balanceMap(balances);

  let synced=0;
  let skipped=0;
  let syncedTransactions=0;
  let skippedTransactions=0;
  const localAccountsByExternalId=new Map<string,string>();
  const batch=adminDb.batch();

  for(const external of accounts.slice(0,100)){
    const externalId=String(external?.id||'');
    if(!validUuid(externalId)){
      skipped++;
      continue;
    }

    const normalizedType=mapBelvoAccountType(external?.category);
    const balanceType=String(external?.balance_type||'ASSET').toUpperCase();
    if(balanceType==='LIABILITY'||normalizedType==='credit_card'||normalizedType==='liability'){
      skipped++;
      continue;
    }

    const explicitBalance=balancesByAccount.get(externalId)||
      balancesByAccount.get(String(external?.internal_identification||''));
    const available=decimalToMinor(explicitBalance?.available);
    const current=decimalToMinor(external?.balance?.current);
    const balanceMinor=available??current;
    if(balanceMinor===null){
      skipped++;
      continue;
    }

    const accountId=hash(`belvo_ofda|${connectionId}|${externalId}`);
    const accountRef=household.collection('accounts').doc(accountId);
    const rawName=String(external?.name||'').trim();
    const category=String(external?.category||'').toUpperCase();
    const institutionCode=String(external?.institution?.name||connection.institutionCode||'');
    const fallback=normalizedType==='investment'
      ? 'Investimentos'
      : category==='SAVINGS_ACCOUNT'
        ? 'Poupança'
        : 'Conta';
    const name=rawName||`${institutionLabel(institutionCode)} · ${fallback}`;

    localAccountsByExternalId.set(externalId,accountId);

    batch.set(accountRef,{
      name:name.slice(0,60),
      type:normalizedType==='investment'?'bank':'bank',
      connectedProductType:normalizedType,
      balanceMinor,
      amountMinor:balanceMinor,
      currency:String(explicitBalance?.currency||external?.currency||external?.balance?.currency||'BRL'),
      scope:'household',
      status:'active',
      source:'open_finance',
      provider:'belvo_ofda',
      connectionId,
      externalAccountId:externalId,
      institutionCode,
      institutionName:institutionLabel(institutionCode),
      readOnlySync:true,
      balanceAsOf:String(explicitBalance?.last_updated_at||external?.collected_at||new Date().toISOString()),
      automaticallyInvestedMinor:decimalToMinor(explicitBalance?.automatically_invested),
      updatedAt:FieldValue.serverTimestamp(),
      schemaVersion:2
    },{merge:true});
    synced++;
  }

  for(const external of transactions.slice(0,250)){
    const externalId=String(external?.id||'');
    const accountExternalId=String(external?.account?.id||'');
    const localAccountId=localAccountsByExternalId.get(accountExternalId);
    const amountMinor=decimalToMinor(external?.amount);
    const providerType=String(external?.type||'').toUpperCase();

    if(!validUuid(externalId)||!localAccountId||amountMinor===null||amountMinor<=0||!['INFLOW','OUTFLOW'].includes(providerType)){
      skippedTransactions++;
      continue;
    }

    const observedOn=String(external?.value_date||external?.accounting_date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)){
      skippedTransactions++;
      continue;
    }

    const transactionId=hash(`belvo_ofda_transaction|${connectionId}|${externalId}`);
    const transactionRef=household.collection('transactions').doc(transactionId);
    const description=String(external?.description||external?.merchant?.name||'Movimentação bancária')
      .normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,120);

    batch.set(transactionRef,{
      description:description||'Movimentação bancária',
      amountMinor,
      currency:String(external?.currency||'BRL'),
      direction:providerType==='INFLOW'?'income':'expense',
      source:'open_finance',
      provider:'belvo_ofda',
      connectionId,
      accountId:localAccountId,
      externalTransactionId:externalId,
      providerStatus:String(external?.status||'PROCESSED'),
      status:String(external?.status||'').toUpperCase()==='PENDING'?'pending':'confirmed',
      observedOn,
      createdAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
      readOnlySync:true,
      recurring:false,
      recurrence:null,
      dueDay:null,
      installment:null,
      schemaVersion:2
    },{merge:true});
    syncedTransactions++;
  }

  batch.set(connectionRef,{
    status:synced>0?'ready':'syncing',
    accountCount:synced,
    skippedAccountCount:skipped,
    transactionCount:syncedTransactions,
    skippedTransactionCount:skippedTransactions,
    lastSyncAt:FieldValue.serverTimestamp(),
    lastSyncStatus:synced>0?'success':'waiting_for_provider_data',
    updatedAt:FieldValue.serverTimestamp()
  },{merge:true});

  batch.create(household.collection('auditEvents').doc(),{
    type:'open_finance.synced',
    actorUid,
    connectionId,
    provider:'belvo_ofda',
    syncedAccountCount:synced,
    skippedAccountCount:skipped,
    syncedTransactionCount:syncedTransactions,
    skippedTransactionCount:skippedTransactions,
    createdAt:FieldValue.serverTimestamp()
  });

  await batch.commit();
  return {
    synced,
    skipped,
    syncedTransactions,
    skippedTransactions,
    status:synced>0?'ready':'syncing'
  };
}

export async function listOpenFinanceConnections(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_connections');

    const snap=await adminDb.collection('households').doc(householdId)
      .collection('bankConnections').orderBy('createdAt','desc').limit(20).get();

    return res.json({
      ok:true,
      configured:isBelvoConfigured(),
      provider:'belvo_ofda',
      connections:snap.docs.map(doc=>{
        const data=doc.data();
        return {
          id:doc.id,
          institutionKey:String(data.institutionKey||'other'),
          institutionName:String(data.institutionName||'Instituição conectada'),
          institutionCode:String(data.institutionCode||''),
          status:String(data.status||'pending'),
          accountCount:Number(data.accountCount||0),
          lastSyncStatus:String(data.lastSyncStatus||'never'),
          lastSyncAt:data.lastSyncAt?.toDate?.()?.toISOString?.()??null
        };
      })
    });
  }catch(err:any){
    return error(res,err.statusCode||500,safeProviderError(err));
  }
}

export async function startOpenFinanceConnection(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_connections');

    const cpf=normalizeCpf(req.body?.cpf);
    const legalName=normalizeLegalName(req.body?.legalName);
    if(!isValidCpf(cpf)||legalName.length<3) return error(res,400,'INVALID_OPEN_FINANCE_IDENTITY');

    const origin=allowedOrigin(req.body?.returnOrigin);
    const institution=institutionFor(req.body?.institutionKey);
    if(!isBelvoConfigured()) return error(res,503,'OPEN_FINANCE_NOT_CONFIGURED');

    const household=adminDb.collection('households').doc(householdId);
    const sessionId=randomUUID();
    const externalId=`nb-${sessionId.replace(/-/g,'')}`;
    const sessionRef=household.collection('bankConnectionSessions').doc(sessionId);
    const expiresAtMs=Date.now()+SESSION_TTL_MS;
    const callbackBase=`${origin}/banking/callback?session=${encodeURIComponent(sessionId)}`;
    const termsUrl=`${origin}/open-finance/terms`;

    await sessionRef.create({
      provider:'belvo_ofda',
      institutionKey:institution.key,
      institutionName:institution.name,
      externalId,
      createdBy:user.uid,
      createdAt:FieldValue.serverTimestamp(),
      expiresAtMs,
      status:'started',
      returnOrigin:origin
    });

    try{
      const widget=await createBelvoWidgetAccess({
        cpf,
        legalName,
        externalId,
        callbackSuccess:`${callbackBase}&outcome=success`,
        callbackExit:`${callbackBase}&outcome=exit`,
        callbackEvent:`${callbackBase}&outcome=event`,
        termsUrl,
        institution:institution.belvoInstitution
      });

      await sessionRef.update({
        status:'widget_ready',
        widgetIssuedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp()
      });

      return res.status(201).json({
        ok:true,
        sessionId,
        provider:'belvo_ofda',
        institution:{key:institution.key,name:institution.name},
        widgetUrl:widget.widgetUrl,
        expiresInSeconds:widget.accessExpiresInSeconds
      });
    }catch(err){
      await sessionRef.set({
        status:'provider_error',
        updatedAt:FieldValue.serverTimestamp()
      },{merge:true});
      throw err;
    }
  }catch(err:any){
    return error(res,err.statusCode||500,safeProviderError(err));
  }
}

export async function completeOpenFinanceConnection(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const sessionId=String(req.body?.sessionId||'');
    const linkId=String(req.body?.linkId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_connections');

    if(!validUuid(sessionId)||!validUuid(linkId)) return error(res,400,'OPEN_FINANCE_LINK_INVALID');
    const household=adminDb.collection('households').doc(householdId);
    const sessionRef=household.collection('bankConnectionSessions').doc(sessionId);
    const sessionSnap=await sessionRef.get();
    if(!sessionSnap.exists) return error(res,404,'OPEN_FINANCE_SESSION_NOT_FOUND');
    const session=sessionSnap.data()!;
    if(session.createdBy!==user.uid) return error(res,403,'HOUSEHOLD_ACCESS_DENIED');
    if(Number(session.expiresAtMs||0)<Date.now()) return error(res,410,'OPEN_FINANCE_SESSION_EXPIRED');

    const link=await getBelvoLink(linkId);
    if(String(link?.id||'')!==linkId) return error(res,409,'OPEN_FINANCE_LINK_INVALID');
    if(linkExternalId(link)!==String(session.externalId||'')) return error(res,409,'OPEN_FINANCE_LINK_MISMATCH');

    const connectionId=hash(`belvo_ofda|${linkId}`).slice(0,40);
    const connectionRef=household.collection('bankConnections').doc(connectionId);
    const institutionCode=linkInstitution(link);
    const institutionName=institutionLabel(institutionCode);

    await adminDb.runTransaction(async tx=>{
      const freshSession=await tx.get(sessionRef);
      if(!freshSession.exists) fail('OPEN_FINANCE_SESSION_NOT_FOUND',404);

      tx.set(connectionRef,{
        provider:'belvo_ofda',
        linkId,
        externalId:String(session.externalId||''),
        institutionKey:String(session.institutionKey||'other'),
        institutionCode,
        institutionName,
        status:'connected',
        accountCount:0,
        createdBy:user.uid,
        createdAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
        consentMode:'recurrent',
        schemaVersion:1
      },{merge:true});

      tx.update(sessionRef,{
        status:'completed',
        connectionId,
        completedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp()
      });

      tx.create(household.collection('auditEvents').doc(),{
        type:'open_finance.connected',
        actorUid:user.uid,
        connectionId,
        provider:'belvo_ofda',
        institutionCode,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    const sync=await syncConnection(householdId,connectionId,user.uid)
      .catch(()=>({synced:0,skipped:0,syncedTransactions:0,skippedTransactions:0,status:'syncing'}));
    return res.status(201).json({ok:true,connectionId,institutionName,...sync});
  }catch(err:any){
    return error(res,err.statusCode||500,safeProviderError(err));
  }
}

export async function syncOpenFinanceConnection(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const connectionId=String(req.body?.connectionId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_connections');
    if(!/^[a-f0-9]{40}$/.test(connectionId)) return error(res,400,'OPEN_FINANCE_CONNECTION_NOT_FOUND');

    const result=await syncConnection(householdId,connectionId,user.uid);
    return res.json({ok:true,connectionId,...result});
  }catch(err:any){
    return error(res,err.statusCode||500,safeProviderError(err));
  }
}


export async function disconnectOpenFinanceConnection(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const connectionId=String(req.body?.connectionId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_connections');
    if(!/^[a-f0-9]{40}$/.test(connectionId)) return error(res,400,'OPEN_FINANCE_CONNECTION_NOT_FOUND');

    const household=adminDb.collection('households').doc(householdId);
    const connectionRef=household.collection('bankConnections').doc(connectionId);
    const connectionSnap=await connectionRef.get();
    if(!connectionSnap.exists) return error(res,404,'OPEN_FINANCE_CONNECTION_NOT_FOUND');

    const connection=connectionSnap.data()!;
    if(connection.status==='disconnected'){
      return res.json({ok:true,status:'disconnected',connectionId});
    }

    const linkId=String(connection.linkId||'');
    if(!validUuid(linkId)) return error(res,409,'OPEN_FINANCE_LINK_INVALID');

    await deleteBelvoLink(linkId);

    const accountSnap=await household.collection('accounts')
      .where('connectionId','==',connectionId)
      .limit(100).get();

    const batch=adminDb.batch();
    batch.update(connectionRef,{
      status:'disconnected',
      disconnectedBy:user.uid,
      disconnectedAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
      lastSyncStatus:'revoked'
    });

    for(const doc of accountSnap.docs){
      batch.update(doc.ref,{
        status:'disconnected',
        updatedAt:FieldValue.serverTimestamp()
      });
    }

    batch.create(household.collection('auditEvents').doc(),{
      type:'open_finance.disconnected',
      actorUid:user.uid,
      connectionId,
      provider:'belvo_ofda',
      preservedTransactionHistory:true,
      disconnectedAccountCount:accountSnap.size,
      createdAt:FieldValue.serverTimestamp()
    });

    await batch.commit();
    return res.json({
      ok:true,
      status:'disconnected',
      connectionId,
      disconnectedAccounts:accountSnap.size
    });
  }catch(err:any){
    return error(res,err.statusCode||500,safeProviderError(err));
  }
}

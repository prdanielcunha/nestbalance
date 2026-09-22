import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const apiBase='http://127.0.0.1:8181';
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST||'127.0.0.1:9099';

async function waitForHealth(){
  let lastError;
  for(let attempt=0;attempt<80;attempt++){
    try{
      const response=await fetch(apiBase+'/api/healthz');
      if(response.ok) return await response.json();
    }catch(error){
      lastError=error;
    }
    await new Promise(resolve=>setTimeout(resolve,125));
  }
  throw lastError||new Error('API_DID_NOT_START');
}

async function createEmulatorUser(email,password){
  const response=await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({email,password,returnSecureToken:true})
  });
  const json=await response.json();
  assert.equal(response.ok,true,JSON.stringify(json));
  assert.equal(typeof json.idToken,'string');
  assert.equal(typeof json.localId,'string');
  return {token:json.idToken,uid:json.localId,email};
}

async function post(path,token,body={},expectedStatus){
  const response=await fetch(apiBase+path,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      ...(token?{authorization:`Bearer ${token}`}:{})
    },
    body:JSON.stringify(body)
  });
  const json=await response.json().catch(()=>({}));
  if(expectedStatus!==undefined) assert.equal(response.status,expectedStatus,JSON.stringify(json));
  else assert.equal(response.ok,true,`${path} -> ${response.status}: ${JSON.stringify(json)}`);
  return {status:response.status,json};
}

test('authenticated API flow: first login, couple invite, daily finance and personal privacy',async()=>{
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth emulator must be running');
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator must be running');

  const server=spawn(process.execPath,['server-dist/server.mjs'],{
    env:{
      ...process.env,
      PORT:'8181',
      FIREBASE_PROJECT_ID:'demo-nestbalance-auth',
      GCLOUD_PROJECT:'demo-nestbalance-auth',
      GOOGLE_CLOUD_PROJECT:'demo-nestbalance-auth',
      FIREBASE_STORAGE_BUCKET:'demo-nestbalance-auth.appspot.com',
      NESTBALANCE_ENV:'test'
    },
    stdio:['ignore','pipe','pipe']
  });
  let serverLog='';
  server.stdout.on('data',chunk=>{ serverLog+=String(chunk); });
  server.stderr.on('data',chunk=>{ serverLog+=String(chunk); });

  const seedApp=initializeApp({projectId:'demo-nestbalance-auth'},'nestbalance-auth-flow-seeder');
  const seedDb=getFirestore(seedApp);

  try{
    const health=await waitForHealth();
    assert.equal(health.ok,true);
    assert.equal(health.environment,'test');

    const anonymous=await post('/api/session/bootstrap','',{},401);
    assert.equal(anonymous.json.error,'AUTH_REQUIRED');

    const owner=await createEmulatorUser('owner@nestbalance.test','OwnerPass123!');
    const ownerDevice={id:'device_owner_000001',label:'iPhone'};
    const ownerBootstrap=await post('/api/session/bootstrap',owner.token,{preferredLocale:'en',device:ownerDevice});
    assert.equal(ownerBootstrap.json.ok,true);
    assert.equal(ownerBootstrap.json.created,true);
    assert.equal(ownerBootstrap.json.households.length,1);
    assert.equal(ownerBootstrap.json.households[0].role,'owner');
    assert.equal(ownerBootstrap.json.locale,'en');
    assert.equal(ownerBootstrap.json.households[0].locale,'en');
    assert.equal(ownerBootstrap.json.deviceFirstSeen,true);
    const householdId=ownerBootstrap.json.householdId;

    const devices=await post('/api/security/devices',owner.token,{device:ownerDevice});
    assert.equal(devices.json.devices.length,1);
    assert.equal(devices.json.devices[0].label,'iPhone');
    assert.equal(devices.json.devices[0].current,true);

    const repeatBootstrap=await post('/api/session/bootstrap',owner.token,{});
    assert.equal(repeatBootstrap.json.created,false);
    assert.equal(repeatBootstrap.json.householdId,householdId);

    const account=await post('/api/accounts/create',owner.token,{
      householdId,
      name:'Conta principal',
      type:'bank',
      balanceMinor:250000,
      scope:'household'
    });
    assert.equal(account.status,201);
    assert.equal(account.json.status,'created');

    const commitment=await post('/api/capture/commit',owner.token,{
      householdId,
      sourceText:'Internet Vivo 119,90 dia 10 todo mês',
      observedOn:'2026-09-10',
      scope:'household'
    });
    assert.equal(commitment.status,201);

    const householdExpense=await post('/api/capture/commit',owner.token,{
      householdId,
      sourceText:'paguei 186 da água',
      observedOn:'2026-09-18',
      scope:'household'
    });
    assert.equal(householdExpense.status,201);

    const duplicate=await post('/api/capture/commit',owner.token,{
      householdId,
      sourceText:'paguei 186 da água',
      observedOn:'2026-09-18',
      scope:'household'
    });
    assert.equal(duplicate.status,200);
    assert.equal(duplicate.json.status,'duplicate');
    assert.equal(duplicate.json.id,householdExpense.json.id);

    const privateExpense=await post('/api/capture/commit',owner.token,{
      householdId,
      sourceText:'livro 45,90',
      observedOn:'2026-09-19',
      scope:'personal'
    });
    assert.equal(privateExpense.status,201);

    const invite=await post('/api/household/invite',owner.token,{
      householdId,
      role:'member',
      email:'partner@nestbalance.test'
    });
    assert.equal(invite.status,201);
    assert.equal(typeof invite.json.token,'string');

    const partner=await createEmulatorUser('partner@nestbalance.test','PartnerPass123!');

    // /invite authenticates without financial bootstrap, so a new partner
    // must be able to join the intended Household before any default space exists.
    const accepted=await post('/api/household/invite/accept',partner.token,{token:invite.json.token});
    assert.equal(accepted.json.householdId,householdId);
    assert.equal(accepted.json.role,'member');

    const partnerBootstrap=await post('/api/session/bootstrap',partner.token,{});
    assert.equal(partnerBootstrap.json.created,false);
    assert.equal(partnerBootstrap.json.householdId,householdId);
    assert.equal(partnerBootstrap.json.households.length,1);
    assert.equal(partnerBootstrap.json.households[0].id,householdId);
    assert.equal(partnerBootstrap.json.households[0].role,'member');

    const ownerHome=await post('/api/home',owner.token,{householdId});
    assert.equal(ownerHome.json.accounts.some(item=>item.name==='Conta principal'&&item.balanceMinor===250000),true);
    assert.equal(ownerHome.json.commitments.some(item=>/Internet Vivo/i.test(item.description)&&item.amountMinor===11990),true);
    assert.equal(ownerHome.json.transactions.some(item=>item.id===householdExpense.json.id),true);
    assert.equal(ownerHome.json.transactions.some(item=>item.id===privateExpense.json.id&&item.scope==='personal'),true);

    const partnerHome=await post('/api/home',partner.token,{householdId});
    assert.equal(partnerHome.json.accounts.some(item=>item.name==='Conta principal'),true);
    assert.equal(partnerHome.json.commitments.some(item=>/Internet Vivo/i.test(item.description)),true);
    assert.equal(partnerHome.json.transactions.some(item=>item.id===householdExpense.json.id),true);
    assert.equal(partnerHome.json.transactions.some(item=>item.id===privateExpense.json.id),false);

    const memberCannotManageFinance=await post('/api/accounts/create',partner.token,{
      householdId,
      name:'Conta indevida',
      type:'bank',
      balanceMinor:100,
      scope:'household'
    },403);
    assert.equal(memberCannotManageFinance.json.error,'HOUSEHOLD_ACCESS_DENIED');

    const screenEvidenceId='screenpots001';
    await seedDb.doc(`households/${householdId}/evidenceAssets/${screenEvidenceId}`).set({
      status:'accepted',
      immutable:true,
      scope:'household',
      ownerUid:null,
      originalName:'cofrinhos-nubank.png',
      mimeType:'image/png',
      declaredMimeType:'image/png',
      verifiedSize:128,
      sha256:'1'.repeat(64),
      storagePath:'test/cofrinhos-nubank.png',
      createdAt:new Date('2026-09-20T12:00:00Z')
    });

    const potScreen={
      screenType:'savings_pots',
      institution:'Nubank',
      accounts:[],
      pots:[{
        name:'Viagem',
        balanceMinor:101568,
        goalMinor:255000,
        targetDate:'2026-12-15',
        currency:'BRL',
        confidence:0.99
      }],
      cards:[],
      commitments:[],
      movements:[{
        description:'Movimento com data impossível',
        amountMinor:1000,
        direction:'expense',
        dateIso:'2026-02-31',
        confidence:0.99,
        needsReview:false,
        visibleText:'31/02 Movimento -10,00'
      }],
      summary:'Cofrinho Viagem'
    };

    const firstScreenImport=await post('/api/financial-screen/commit',owner.token,{
      householdId,
      evidenceId:screenEvidenceId,
      screenSnapshot:potScreen,
      analysisSource:'client_reviewed',
      includeMovements:true
    });
    assert.equal(firstScreenImport.status,201);
    assert.equal(firstScreenImport.json.counts.pots,1);
    assert.equal(firstScreenImport.json.counts.movements,0);
    assert.equal(firstScreenImport.json.counts.skipped,1);

    await post('/api/financial-screen/commit',owner.token,{
      householdId,
      evidenceId:screenEvidenceId,
      screenSnapshot:potScreen,
      analysisSource:'client_reviewed',
      includeMovements:true
    });

    await post('/api/financial-screen/commit',owner.token,{
      householdId,
      evidenceId:screenEvidenceId,
      screenSnapshot:{...potScreen,pots:[{...potScreen.pots[0],balanceMinor:120000}],movements:[]},
      analysisSource:'client_reviewed'
    });

    const homeAfterPotSync=await post('/api/home',owner.token,{householdId});
    const syncedPots=homeAfterPotSync.json.savingsPots.filter(item=>item.name==='Viagem'&&item.institutionName==='Nubank');
    assert.equal(syncedPots.length,1);
    assert.equal(syncedPots[0].balanceMinor,120000);
    assert.equal(homeAfterPotSync.json.transactions.some(item=>item.source==='screen_import'),false);

    const partnerAfterPotSync=await post('/api/home',partner.token,{householdId});
    assert.equal(partnerAfterPotSync.json.savingsPots.some(item=>item.name==='Viagem'&&item.balanceMinor===120000),true);

    const receiptEvidenceId='internetmar01';
    await seedDb.doc(`households/${householdId}/evidenceAssets/${receiptEvidenceId}`).set({
      status:'accepted',
      immutable:true,
      scope:'household',
      ownerUid:null,
      originalName:'comprovante-internet-marco.pdf',
      mimeType:'application/pdf',
      declaredMimeType:'application/pdf',
      verifiedSize:256,
      sha256:'2'.repeat(64),
      storagePath:'test/comprovante-internet-marco.pdf',
      lastExtractionVersion:'native-text-v1',
      createdAt:new Date('2026-03-11T12:00:00Z')
    });
    await seedDb.doc(`households/${householdId}/evidenceAssets/${receiptEvidenceId}/extractions/native-text-v1`).set({
      state:'extracted',
      parser:'test-seed',
      text:'Comprovante de pagamento da internet Vivo R$ 119,90 em 10/03/2026',
      signals:{candidates:[]},
      extraction:{
        description:'Internet residencial',
        payee:'Vivo',
        amountMinor:11990,
        dateIso:'2026-03-10',
        evidenceSummary:'Pagamento da internet do Lar'
      }
    });

    const vaultSearch=await post('/api/vault/search',owner.token,{
      householdId,
      query:'comprovante da internet de março',
      view:'household'
    });
    assert.equal(vaultSearch.json.items[0]?.evidenceId,receiptEvidenceId);

    const card=await post('/api/cards/create',owner.token,{
      householdId,
      name:'Nubank',
      brand:'mastercard',
      closingDay:7,
      dueDay:14,
      last4:'1234',
      limitMinor:500000,
      scope:'household'
    });
    assert.equal(card.status,201);

    const invoiceEvidenceId='invoiceproof001';
    await seedDb.doc(`households/${householdId}/evidenceAssets/${invoiceEvidenceId}`).set({
      status:'accepted',
      immutable:true,
      scope:'household',
      ownerUid:null,
      originalName:'fatura-setembro.pdf',
      mimeType:'application/pdf',
      declaredMimeType:'application/pdf',
      verifiedSize:512,
      sha256:'3'.repeat(64),
      storagePath:'test/fatura-setembro.pdf',
      createdAt:new Date('2026-09-10T12:00:00Z')
    });
    await seedDb.doc(`households/${householdId}/evidenceAssets/${invoiceEvidenceId}/extractions/native-text-v1`).set({
      state:'extracted',
      parser:'test-seed',
      text:[
        'Vencimento 14/09/2026',
        '05/09 MERCADO CENTRAL 129,90',
        '06/09 LOJA XPTO PARC 03/10 89,90',
        'PAGAMENTO DA FATURA 500,00',
        'TOTAL DA FATURA 719,80'
      ].join('\n')
    });

    const invoicePreview=await post('/api/invoices/preview',owner.token,{
      householdId,
      cardId:card.json.id,
      evidenceId:invoiceEvidenceId,
      referenceDate:'2026-09-10'
    });
    assert.equal(invoicePreview.json.preview.items.length,2);
    assert.deepEqual(invoicePreview.json.preview.items[1].installment,{current:3,total:10});

    const invoiceCommit=await post('/api/invoices/commit',owner.token,{
      householdId,
      cardId:card.json.id,
      evidenceId:invoiceEvidenceId,
      referenceDate:'2026-09-10',
      itemIds:invoicePreview.json.preview.items.map(item=>item.id)
    });
    assert.equal(invoiceCommit.status,201);
    assert.equal(invoiceCommit.json.created,2);
    assert.equal(invoiceCommit.json.installmentPlans,1);

    const invoiceDuplicate=await post('/api/invoices/commit',owner.token,{
      householdId,
      cardId:card.json.id,
      evidenceId:invoiceEvidenceId,
      referenceDate:'2026-09-10',
      itemIds:invoicePreview.json.preview.items.map(item=>item.id)
    });
    assert.equal(invoiceDuplicate.status,200);
    assert.equal(invoiceDuplicate.json.status,'duplicate');
    assert.equal(invoiceDuplicate.json.created,0);

    const matchedPayment=await post('/api/commitments/match-payment',owner.token,{
      householdId,
      amountMinor:11990,
      description:'Pix Internet Vivo',
      observedOn:'2026-09-10'
    });
    assert.equal(matchedPayment.json.matches[0]?.commitment?.id,commitment.json.id);
    assert.ok(matchedPayment.json.matches[0]?.score>=82);

    const paidInternet=await post('/api/commitments/pay',owner.token,{
      householdId,
      commitmentId:commitment.json.id,
      paidOn:'2026-09-10'
    });
    assert.equal(paidInternet.status,201);
    assert.equal(paidInternet.json.status,'paid');
    assert.equal(paidInternet.json.periodKey,'2026-09');

    const homeAfterPayment=await post('/api/home',owner.token,{householdId});
    assert.equal(homeAfterPayment.json.commitments.some(item=>item.id===commitment.json.id&&item.paidThisMonth===true),true);
    assert.equal(homeAfterPayment.json.transactions.some(item=>item.id===paidInternet.json.transactionId&&item.source==='commitment_payment'),true);

    const assistantAfterPayment=await post('/api/assistant/answer',owner.token,{
      householdId,
      question:'Quanto ainda falta pagar?',
      view:'household'
    });
    assert.equal(assistantAfterPayment.json.grounded,true);
    assert.equal(assistantAfterPayment.json.answer.intent,'remaining_to_pay');
    assert.equal(assistantAfterPayment.json.answer.sources.some(item=>item.id===commitment.json.id),false);

    const undoneInternet=await post('/api/commitments/undo-payment',owner.token,{
      householdId,
      commitmentId:commitment.json.id,
      periodKey:'2026-09'
    });
    assert.equal(undoneInternet.json.status,'reversed');

    const homeAfterUndo=await post('/api/home',owner.token,{householdId});
    assert.equal(homeAfterUndo.json.commitments.some(item=>item.id===commitment.json.id&&item.paidThisMonth===false),true);
    assert.equal(homeAfterUndo.json.transactions.some(item=>item.id===paidInternet.json.transactionId),false);

    const assistantAfterUndo=await post('/api/assistant/answer',owner.token,{
      householdId,
      question:'Quanto ainda falta pagar?',
      view:'household'
    });
    assert.equal(assistantAfterUndo.json.answer.intent,'remaining_to_pay');
    assert.equal(assistantAfterUndo.json.answer.sources.some(item=>item.id===commitment.json.id&&item.amountMinor===11990),true);

    await post('/api/commitments/pay',owner.token,{
      householdId,
      commitmentId:commitment.json.id,
      paidOn:'2026-09-10'
    });
    await post('/api/commitments/pay',owner.token,{
      householdId,
      commitmentId:commitment.json.id,
      paidOn:'2026-10-10'
    });

    const blockedOldUndo=await post('/api/commitments/undo-payment',owner.token,{
      householdId,
      commitmentId:commitment.json.id,
      periodKey:'2026-09'
    },409);
    assert.equal(blockedOldUndo.json.error,'PAYMENT_UNDO_BLOCKED_BY_LATER_PAYMENT');

    const undoOctober=await post('/api/commitments/undo-payment',owner.token,{
      householdId,
      commitmentId:commitment.json.id,
      periodKey:'2026-10'
    });
    assert.equal(undoOctober.json.status,'reversed');

    const undoSeptemberAfterOctober=await post('/api/commitments/undo-payment',owner.token,{
      householdId,
      commitmentId:commitment.json.id,
      periodKey:'2026-09'
    });
    assert.equal(undoSeptemberAfterOctober.json.status,'reversed');

    const ownerFinal=await post('/api/session/bootstrap',owner.token,{householdId,device:ownerDevice});
    assert.equal(ownerFinal.json.householdId,householdId);
    assert.equal(ownerFinal.json.created,false);
    assert.equal(ownerFinal.json.deviceFirstSeen,false);

    const revoked=await post('/api/security/revoke-sessions',owner.token,{});
    assert.equal(revoked.json.ok,true);
    const ownerAfterRevocation=await post('/api/home',owner.token,{householdId},401);
    assert.equal(ownerAfterRevocation.json.error,'INVALID_SESSION');

    const partnerAfterOwnerRevocation=await post('/api/home',partner.token,{householdId});
    assert.equal(partnerAfterOwnerRevocation.json.ok,true);
  }finally{
    await deleteApp(seedApp);
    server.kill('SIGTERM');
    await new Promise(resolve=>{
      if(server.exitCode!==null) return resolve();
      const timer=setTimeout(resolve,2000);
      server.once('exit',()=>{clearTimeout(timer);resolve();});
    });
    if(server.exitCode!==0&&server.exitCode!==null&&server.exitCode!==143){
      console.error(serverLog);
    }
  }
});

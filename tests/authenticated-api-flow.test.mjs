import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

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

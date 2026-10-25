import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {Timestamp} from 'firebase-admin/firestore';
import {adminAuth,adminDb} from '../server/firebase-admin.js';
import {commitReviewedScreen,undoReviewedScreen} from '../server/reviewed-screen.js';

// Exercise the real handlers and auth/capability checks with a transaction
// adapter. The Firebase emulator flow separately verifies SDK/database behavior.
test('reviewed screenshot handler preserves sources, versions, privacy and undo',async()=>{
  const docs=new Map<string,any>();let counter=0;let clock=1_800_000_000_000;
  class Ref{
    constructor(readonly path:string){}
    get id(){return this.path.split('/').at(-1)!;}
    collection(name:string){return new Collection(this.path+'/'+name);}
    async get(){return snapshot(this);}
  }
  class Collection{
    constructor(readonly path:string){}
    doc(id='generated_'+String(++counter).padStart(8,'0')){return new Ref(this.path+'/'+id);}
  }
  const snapshot=(ref:Ref)=>({ref,id:ref.id,exists:docs.has(ref.path),data:()=>docs.get(ref.path)});
  const resolve=(value:any,previous:any,now:Timestamp):any=>{
    if(value?.constructor.name==='ServerTimestampTransform') return now;
    if(value?.constructor.name==='ArrayUnionTransform') return [...new Set([...(previous||[]),...value.elements])];
    if(value instanceof Timestamp||value===null||typeof value!=='object') return value;
    if(Array.isArray(value)) return value.map((v,i)=>resolve(v,previous?.[i],now));
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v,previous?.[k],now)]));
  };
  const mocks=[
    mock.method(adminAuth,'verifyIdToken',async(token:string)=>({uid:token,auth_time:1_800_000_000})),
    mock.method(adminDb,'doc',(path:string)=>new Ref(path)),
    mock.method(adminDb,'collection',(path:string)=>new Collection(path)),
    mock.method(adminDb,'runTransaction',async(fn:any)=>{
      const writes:any[]=[];
      const result=await fn({get:async(ref:Ref)=>{assert.equal(writes.length,0,'All reads must precede writes');return snapshot(ref);},set:(ref:Ref,data:any,options:any)=>writes.push({ref,data,merge:options?.merge}),create:(ref:Ref,data:any)=>{assert.equal(docs.has(ref.path),false);writes.push({ref,data});},update:(ref:Ref,data:any)=>writes.push({ref,data,merge:true})});
      const now=Timestamp.fromMillis(++clock);
      for(const w of writes){const old=docs.get(w.ref.path);docs.set(w.ref.path,{...(w.merge?old:{}),...resolve(w.data,old,now)});}
      return result;
    })
  ];
  const householdId='household_review_test';
  docs.set(`households/${householdId}/members/owner_test`,{role:'owner'});
  docs.set(`households/${householdId}/members/viewer_test`,{role:'read_only'});
  docs.set(`households/${householdId}/members/partner_test`,{role:'member'});
  const ev=(id:string,scope='household')=>{docs.set(`households/${householdId}/evidenceAssets/${id}`,{status:'accepted',immutable:true,scope,ownerUid:scope==='personal'?'owner_test':null});};
  async function call(handler:any,body:any,uid='owner_test'){
    let code=200;let json:any;
    await handler({body:{householdId,...body},header:()=>`Bearer ${uid}`},{setHeader:()=>{},status:(value:number)=>{code=value;return {json:(value:any)=>{json=value;}};},json:(value:any)=>{json=value;}});
    return {code,json};
  }
  const screen={screenType:'savings_pots',institution:'Nubank',accounts:[],pots:[{name:'Viagem',balanceMinor:10000,goalMinor:null,targetDate:null,currency:'BRL',confidence:0.99}],cards:[],commitments:[],movements:[],summary:'Viagem'};
  const review={observedOn:'2026-09-20',accounts:[],pots:[{createNew:true}]};
  try{
    ev('evidence_first');
    assert.equal((await call(commitReviewedScreen,{evidenceId:'evidence_first',screenSnapshot:screen})).code,409);
    assert.equal((await call(commitReviewedScreen,{evidenceId:'evidence_first',screenSnapshot:screen,review},'viewer_test')).code,403);
    const first=await call(commitReviewedScreen,{evidenceId:'evidence_first',screenSnapshot:screen,review});
    assert.equal(first.code,201);assert.equal(first.json.counts.created,1);
    const replay=await call(commitReviewedScreen,{evidenceId:'evidence_first',screenSnapshot:screen,review});
    assert.equal(replay.json.replayed,true);
    const entry=[...docs.entries()].find(([p])=>p.includes('/savingsPots/'))!;
    const potId=entry[0].split('/').at(-1)!;
    const target={targetId:potId,expectedUpdatedAtMs:entry[1].updatedAt.toMillis(),expectedBalanceMinor:10000};
    ev('evidence_update');
    const update=await call(commitReviewedScreen,{evidenceId:'evidence_update',screenSnapshot:{...screen,pots:[{...screen.pots[0],balanceMinor:20000}]},review:{...review,observedOn:'2026-09-21',pots:[target]}});
    assert.equal(update.code,201);assert.equal(update.json.counts.updated,1);
    assert.equal(docs.get(entry[0]).balanceMinor,20000);
    ev('evidence_stale');
    const conflict=await call(commitReviewedScreen,{evidenceId:'evidence_stale',screenSnapshot:screen,review:{...review,pots:[target]}});
    assert.equal(conflict.json.error,'SCREEN_REVIEW_CONFLICT');
    const fresh={...target,expectedBalanceMinor:20000,expectedUpdatedAtMs:docs.get(entry[0]).updatedAt.toMillis()};
    const older=await call(commitReviewedScreen,{evidenceId:'evidence_stale',screenSnapshot:screen,review:{...review,pots:[fresh]}});
    assert.equal(older.json.error,'SCREEN_OBSERVATION_OLDER');
    const wrongBank=await call(commitReviewedScreen,{evidenceId:'evidence_stale',screenSnapshot:{...screen,institution:'Inter'},review:{...review,pots:[fresh]}});
    assert.equal(wrongBank.json.error,'SCREEN_SOURCE_MISMATCH');
    const undoFirst=await call(undoReviewedScreen,{importId:first.json.importId});
    assert.equal(undoFirst.json.error,'SCREEN_UNDO_CONFLICT');
    const undoPartner=await call(undoReviewedScreen,{importId:update.json.importId},'partner_test');
    assert.equal(undoPartner.json.error,'SCREEN_UNDO_CONFLICT');
    assert.equal((await call(undoReviewedScreen,{importId:update.json.importId})).code,200);
    assert.equal(docs.get(entry[0]).balanceMinor,10000);
    assert.equal((await call(undoReviewedScreen,{importId:update.json.importId})).code,200);
    ev('evidence_private','personal');
    assert.equal((await call(commitReviewedScreen,{evidenceId:'evidence_private',screenSnapshot:screen,review},'partner_test')).code,403);
    ev('evidence_otherbank');
    assert.equal((await call(commitReviewedScreen,{evidenceId:'evidence_otherbank',screenSnapshot:{...screen,institution:'Inter'},review})).json.counts.created,1);
    assert.equal([...docs.keys()].filter(p=>p.includes('/savingsPots/')).length,2);
    assert.equal([...docs.keys()].filter(p=>p.includes('/transactions/')).length,0);
    assert.equal(docs.get(`households/${householdId}/evidenceAssets/evidence_first`).immutable,true);
  }finally{for(const m of mocks)m.mock.restore();}
});

import { readFileSync } from 'node:fs';

const inputPath=process.argv.find(arg=>arg.endsWith('.json'))||'docs/research/field-evidence-template.json';
const requireGates=process.argv.includes('--require-gates');
const data=JSON.parse(readFileSync(inputPath,'utf8'));
const allowedFlows=new Set([
  'SIGN_IN_HOUSEHOLD','FIRST_VALUE','HOME_UNDERSTAND','SIMPLE_CAPTURE','PIX_SCREENSHOT','AUDIO_CAPTURE',
  'CARD_IMPORT','REVIEW_EXCEPTION','COMMITMENT_PAID_UNDO','FIND_EVIDENCE','POT_UPDATE','INVITE_PRIVACY'
]);
const allowedIssues=new Set(['NAVIGATION','LANGUAGE','DENSITY','TRUST','SCOPE_PRIVACY','REVIEW_OVERLOAD','FEEDBACK','PERFORMANCE','ACCESSIBILITY','OTHER','NONE']);
const forbiddenKey=/(?:amount|balance|description|documentText|filename|fileName|assistantQuestion|email|phone|cpf|cardNumber|pixKey|uid|householdId|userId|accountId)/i;

function walk(value,path='root'){
  if(Array.isArray(value)) return value.forEach((item,index)=>walk(item,`${path}[${index}]`));
  if(!value||typeof value!=='object') return;
  for(const [key,child] of Object.entries(value)){
    if(forbiddenKey.test(key)) throw new Error(`FIELD_EVIDENCE_FORBIDDEN_KEY:${path}.${key}`);
    walk(child,`${path}.${key}`);
  }
}
walk(data);
if(data.dataPolicy!=='no-financial-content'||!Array.isArray(data.sessions)) throw new Error('FIELD_EVIDENCE_SCHEMA_INVALID');

const rows=[];
const participantCohorts=new Map();
for(const session of data.sessions){
  if(!Number.isInteger(session.participantOrdinal)||session.participantOrdinal<1) throw new Error('FIELD_EVIDENCE_PARTICIPANT_INVALID');
  if(!['individual','couple','family'].includes(session.cohort)) throw new Error('FIELD_EVIDENCE_COHORT_INVALID');
  if(!['phone','desktop'].includes(session.device)) throw new Error('FIELD_EVIDENCE_DEVICE_INVALID');
  const participantKey=`${session.cohort}:${session.participantOrdinal}`;
  participantCohorts.set(participantKey,session.cohort);
  for(const row of session.flows||[]){
    if(!allowedFlows.has(row.flow)) throw new Error('FIELD_EVIDENCE_FLOW_INVALID');
    if(!['yes','partial','no'].includes(row.success)) throw new Error('FIELD_EVIDENCE_SUCCESS_INVALID');
    if(!allowedIssues.has(row.issueCode||'NONE')) throw new Error('FIELD_EVIDENCE_ISSUE_INVALID');
    for(const key of ['elapsedMs','firstActionMs','steps','corrections']){
      if(row[key]!==undefined&&(!Number.isFinite(row[key])||row[key]<0)) throw new Error('FIELD_EVIDENCE_NUMBER_INVALID');
    }
    if(row.impact!==undefined&&(!Number.isInteger(row.impact)||row.impact<1||row.impact>5)) throw new Error('FIELD_EVIDENCE_IMPACT_INVALID');
    rows.push({...row,participantKey});
  }
}

const percentile=(values,p)=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length) return null;
  const index=Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1));
  return sorted[index];
};
const rate=(values)=>values.length?values.filter(Boolean).length/values.length:null;
const byFlow=(flow)=>rows.filter(row=>row.flow===flow);
const cohorts={individual:0,couple:0,family:0};
for(const cohort of participantCohorts.values()) cohorts[cohort]++;

const captureRows=rows.filter(row=>['SIMPLE_CAPTURE','PIX_SCREENSHOT','AUDIO_CAPTURE','CARD_IMPORT'].includes(row.flow));
const correctionRows=captureRows.filter(row=>Number.isFinite(row.corrections));
const syncValues=rows.map(row=>row.syncLatencyMs).filter(Number.isFinite);
const homeRows=byFlow('HOME_UNDERSTAND');
const priorityRows=homeRows.map(row=>row.firstActionMs).filter(Number.isFinite);
const ttfvValues=byFlow('FIRST_VALUE').map(row=>row.elapsedMs).filter(Number.isFinite);
const oneTapRows=captureRows.filter(row=>typeof row.oneTap==='boolean');
const comprehensionRows=homeRows.filter(row=>typeof row.comprehension==='boolean');

const attemptedParticipants=new Set(rows.map(row=>row.participantKey)).size;
const issueMap=new Map();
for(const row of rows){
  if(!row.issueCode||row.issueCode==='NONE') continue;
  const current=issueMap.get(row.issueCode)||{participants:new Set(),impacts:[]};
  current.participants.add(row.participantKey);
  if(Number.isInteger(row.impact)) current.impacts.push(row.impact);
  issueMap.set(row.issueCode,current);
}
const topFrictions=[...issueMap.entries()].map(([issue,value])=>{
  const frequency=attemptedParticipants?value.participants.size/attemptedParticipants:0;
  const averageImpact=value.impacts.length?value.impacts.reduce((a,b)=>a+b,0)/value.impacts.length:1;
  return {issue,affectedParticipants:value.participants.size,frequency:Number(frequency.toFixed(4)),averageImpact:Number(averageImpact.toFixed(2)),score:Number((frequency*averageImpact).toFixed(4))};
}).sort((a,b)=>b.score-a.score).slice(0,5);

const metrics={
  participants:{total:participantCohorts.size,...cohorts},
  ttfv:{p50Ms:percentile(ttfvValues,.5),p95Ms:percentile(ttfvValues,.95)},
  capture:{p50Ms:percentile(captureRows.map(row=>row.elapsedMs),.5),p95Ms:percentile(captureRows.map(row=>row.elapsedMs),.95),oneTapRate:rate(oneTapRows.map(row=>row.oneTap)),correctionRate:correctionRows.length?correctionRows.filter(row=>row.corrections>0).length/correctionRows.length:null},
  home:{comprehensionRate:rate(comprehensionRows.map(row=>row.comprehension)),priorityActionP50Ms:percentile(priorityRows,.5),priorityActionP95Ms:percentile(priorityRows,.95)},
  sync:{p50Ms:percentile(syncValues,.5),p95Ms:percentile(syncValues,.95)},
  topFrictions
};

const gates={
  participantMix:cohorts.individual>=5&&cohorts.couple>=5&&cohorts.family>=3,
  ttfvUpTo3Min:metrics.ttfv.p50Ms!==null&&metrics.ttfv.p50Ms<=180000,
  captureP50Under8s:metrics.capture.p50Ms!==null&&metrics.capture.p50Ms<8000,
  commonOneTapAtLeast80:metrics.capture.oneTapRate!==null&&metrics.capture.oneTapRate>=.8,
  homeComprehensionAtLeast90:metrics.home.comprehensionRate!==null&&metrics.home.comprehensionRate>=.9,
  priorityActionWithin10s:metrics.home.priorityActionP50Ms!==null&&metrics.home.priorityActionP50Ms<=10000,
  syncP95Under2s:metrics.sync.p95Ms!==null&&metrics.sync.p95Ms<2000,
  topFiveFrictionsMeasured:topFrictions.length>=5
};
const complete=Object.values(gates).every(Boolean);
const report={schemaVersion:1,status:complete?'evidence_complete':'evidence_incomplete',metrics,gates};
console.log(JSON.stringify(report,null,2));
if(requireGates&&!complete) process.exit(2);

import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npmCommand=process.platform==='win32'?'npm.cmd':'npm';

function cleanBuildArtifacts(){
  rmSync('.next',{recursive:true,force:true});
  rmSync('out',{recursive:true,force:true});
}

function run(label,args,env=process.env){
  console.log(`\n[NestBalance] ${label}`);
  const result=spawnSync(npmCommand,args,{stdio:'inherit',env});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
}

let gateError=null;

try{
  cleanBuildArtifacts();
  run(
    'Building isolated browser-test bundle',
    ['run','build'],
    {...process.env,NEXT_PUBLIC_NESTBALANCE_E2E:'true'}
  );
  run('Running authenticated browser release gate',['run','test:e2e:raw']);
}catch(error){
  gateError=error;
}finally{
  try{
    cleanBuildArtifacts();
    const productionEnv={...process.env};
    delete productionEnv.NEXT_PUBLIC_NESTBALANCE_E2E;
    run('Rebuilding clean production web bundle',['run','build'],productionEnv);
  }catch(error){
    if(!gateError) gateError=error;
    else console.error('[NestBalance] Production rebuild also failed:',error);
  }
}

if(gateError){
  console.error('[NestBalance] Production browser gate failed:',gateError);
  process.exit(1);
}

console.log('\n[NestBalance] Browser gate passed and production bundle was rebuilt without E2E fixture mode.');

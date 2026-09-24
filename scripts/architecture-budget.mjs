import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots=['src/features'];
const hardLimit=400;
const legacy={};

function files(root){
  if(!existsSync(root)) return [];
  const out=[];
  for(const name of readdirSync(root)){
    const path=join(root,name);
    const stat=statSync(path);
    if(stat.isDirectory()) out.push(...files(path));
    else if(/\.(tsx|ts)$/.test(name)) out.push(path.replaceAll('\\\\','/'));
  }
  return out;
}

let failed=false;
for(const path of roots.flatMap(files)){
  const lines=readFileSync(path,'utf8').split('\n').length;
  const allowed=legacy[path]||hardLimit;
  if(lines>allowed){
    console.error('[architecture-budget] '+path+': '+lines+' lines > '+allowed);
    failed=true;
  }else if(lines>hardLimit){
    console.log('[architecture-budget] legacy debt: '+path+': '+lines+'/'+allowed);
  }
}
if(failed){
  console.error('[architecture-budget] Split the component or reduce an existing legacy ceiling; do not grow component debt.');
  process.exit(1);
}

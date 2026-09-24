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

const cssLayers=['app/tokens.css','app/primitives.css','app/patterns.css'];
for(const path of cssLayers){
  if(!existsSync(path)){
    console.error('[architecture-budget] Missing CSS layer: '+path);
    failed=true;
  }
}
if(existsSync('app/globals.css')){
  const globalLines=readFileSync('app/globals.css','utf8').split('\n').length;
  const globalLimit=2380; // Ratchet: below the pre-layering 2,382-line legacy file; future work must only shrink it.
  if(globalLines>globalLimit){
    console.error('[architecture-budget] app/globals.css: '+globalLines+' lines > '+globalLimit+'; move styles into tokens/primitives/patterns/features.');
    failed=true;
  }
}

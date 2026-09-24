import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const manifestPath='.next/app-build-manifest.json';
if(!existsSync(manifestPath)){
  console.error('[bundle-budget] Missing .next/app-build-manifest.json. Run npm run build first.');
  process.exit(1);
}

const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const pages=manifest.pages||{};
const defaultBudget=950_000;
const budgets={
  '/':650_000,
  '/add':1_100_000,
  '/accounts':850_000,
  '/movements':850_000,
  '/pots':1_000_000,
  '/assistant':1_050_000,
  '/household':950_000,
  '/inbox':850_000,
  '/together':950_000,
  '/documents':900_000,
  '/vault':900_000,
  '/privacy':750_000
};

function routeFromKey(key){
  let route=String(key).replace(/\/page$/,'')||'/';
  route=route.replace(/\/\([^/]+\)/g,'');
  return route||'/';
}

let failed=false;
const report=[];
for(const [key,files] of Object.entries(pages)){
  const route=routeFromKey(key);
  const js=[...new Set((Array.isArray(files)?files:[]).filter(file=>String(file).endsWith('.js')))];
  const bytes=js.reduce((sum,file)=>{
    const path=join('.next',String(file));
    return sum+(existsSync(path)?statSync(path).size:0);
  },0);
  const budget=budgets[route]||defaultBudget;
  report.push({route,bytes,budget});
  if(bytes>budget) failed=true;
}
report.sort((a,b)=>b.bytes-a.bytes);
for(const item of report){
  console.log('[bundle-budget] '+item.route.padEnd(18)+' '+Math.round(item.bytes/1024)+' KiB / '+Math.round(item.budget/1024)+' KiB');
}
if(failed){
  console.error('[bundle-budget] Route bundle budget exceeded. A justified budget update must be reviewed explicitly.');
  process.exit(1);
}

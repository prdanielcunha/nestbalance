import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const defaultBudget=950_000;
const budgets={
  // Next 16 static export includes shared framework chunks in every route. Home is kept within ~17 KiB of its measured 2026-09-24 baseline after editor/OCR deferral.
  '/':800_000,
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

function routeBudget(route){
  return budgets[route]||defaultBudget;
}

function routeFromHtml(path){
  let name=relative('out',path).split(sep).join('/');
  if(name==='index.html') return '/';
  if(name.endsWith('/index.html')) name=name.slice(0,-'/index.html'.length);
  else if(name.endsWith('.html')) name=name.slice(0,-'.html'.length);
  return '/'+name.replace(/^\/+|\/+$/g,'');
}

function walkHtml(dir){
  const files=[];
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory()) files.push(...walkHtml(path));
    else if(entry.isFile()&&entry.name.endsWith('.html')) files.push(path);
  }
  return files;
}

function reportFromStaticExport(){
  if(!existsSync('out')) return null;
  const report=[];
  for(const htmlPath of walkHtml('out')){
    const html=readFileSync(htmlPath,'utf8');
    const assets=new Set();
    for(const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi)){
      const raw=match[1].split('?')[0];
      if(!raw.startsWith('/_next/')) continue;
      assets.add(join('out',raw.slice(1)));
    }
    const bytes=[...assets].reduce((sum,path)=>sum+(existsSync(path)?statSync(path).size:0),0);
    report.push({route:routeFromHtml(htmlPath),bytes,budget:routeBudget(routeFromHtml(htmlPath))});
  }
  return report;
}

function routeFromManifestKey(key){
  let route=String(key).replace(/\/page$/,'')||'/';
  route=route.replace(/\/\([^/]+\)/g,'');
  return route||'/';
}

function reportFromLegacyManifest(){
  const candidates=['.next/app-build-manifest.json','.next/server/app-build-manifest.json'];
  const manifestPath=candidates.find(existsSync);
  if(!manifestPath) return null;
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const pages=manifest.pages||{};
  const report=[];
  for(const [key,files] of Object.entries(pages)){
    const route=routeFromManifestKey(key);
    const js=[...new Set((Array.isArray(files)?files:[]).filter(file=>String(file).endsWith('.js')))];
    const bytes=js.reduce((sum,file)=>{
      const path=join('.next',String(file));
      return sum+(existsSync(path)?statSync(path).size:0);
    },0);
    report.push({route,bytes,budget:routeBudget(route)});
  }
  return report;
}

const report=reportFromStaticExport()||reportFromLegacyManifest();
if(!report||report.length===0){
  console.error('[bundle-budget] No route bundle source found. Run npm run build first.');
  process.exit(1);
}

let failed=false;
report.sort((a,b)=>b.bytes-a.bytes);
for(const item of report){
  console.log('[bundle-budget] '+item.route.padEnd(18)+' '+Math.round(item.bytes/1024)+' KiB / '+Math.round(item.budget/1024)+' KiB');
  if(item.bytes>item.budget) failed=true;
}
if(failed){
  console.error('[bundle-budget] Route bundle budget exceeded. A justified budget update must be reviewed explicitly.');
  process.exit(1);
}

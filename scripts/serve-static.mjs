import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root=resolve('out');
const port=Number(process.env.PORT||4173);
const mime={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'
};

function safeFile(rawUrl){
  const pathname=decodeURIComponent((rawUrl||'/').split('?')[0]);
  const relative=normalize(pathname).replace(/^(..[/\\])+/, '').replace(/^[/\\]+/,'');
  const candidates=[
    join(root,relative),
    join(root,relative+'.html'),
    join(root,relative,'index.html'),
    join(root,'index.html')
  ];
  for(const file of candidates){
    const absolute=resolve(file);
    if(!absolute.startsWith(root)) continue;
    if(existsSync(absolute)&&statSync(absolute).isFile()) return absolute;
  }
  return null;
}

const app=createServer((req,res)=>{
  const file=safeFile(req.url);
  if(!file){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');
  res.setHeader('Cache-Control','no-store');
  createReadStream(file).pipe(res);
});

app.listen(port,'127.0.0.1',()=>console.log('NestBalance test server listening on '+port));

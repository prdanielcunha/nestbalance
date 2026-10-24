export type OcrBox={x0:number;y0:number;x1:number;y1:number};
export type OcrWord={text:string;bbox:OcrBox;confidence?:number};
export type OcrLine={text:string;words:OcrWord[]};
export type SavingsPotLabelRegion={
  originalLine:string;
  name:string;
  moneyText:string;
  bbox:OcrBox;
};
const plain=(text:string)=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

/** Locate the repeated text column, independently of which letters an icon
 * resembles. Never remove a prefix merely because it is short or unfamiliar.
 */
export function savingsPotLabelRegions(lines:OcrLine[],imageWidth:number):SavingsPotLabelRegion[]{
  if(!Number.isFinite(imageWidth)||imageWidth<100||lines.length>2000) return [];
  if(!lines.some(line=>/\b(?:cofrinhos|caixinhas|savings pots|alcancias)\b/.test(plain(line.text)))) return [];
  const rows=lines.map(line=>({line,money:line.words.findIndex(word=>/^R\$/i.test(word.text))}))
    .filter(({line,money})=>money>0&&/R\$\s*\d[\d. ]*,\d{2}\b/i.test(line.text)
      &&!/^\s*(?:meta|total|saldo|rendimento)\b/i.test(plain(line.text)));
  if(rows.length<3||rows.length>80) return [];
  const tolerance=Math.max(4,imageWidth*0.012);
  const candidates=rows.flatMap(({line,money},row)=>line.words.slice(0,money)
    .filter(word=>word.text.trim().length>=3&&/\p{L}/u.test(word.text)&&word.bbox.x0>imageWidth*0.1&&word.bbox.x0<imageWidth*0.55)
    .map(word=>({left:word.bbox.x0,row})));
  const clusters=candidates.map(candidate=>{
    const members=candidates.filter(other=>Math.abs(other.left-candidate.left)<=tolerance);
    return {left:members.map(x=>x.left).sort((a,b)=>a-b)[Math.floor(members.length/2)],support:new Set(members.map(x=>x.row)).size};
  }).sort((a,b)=>b.support-a.support||a.left-b.left);
  const anchor=clusters[0];
  const minimumSupport=Math.max(3,Math.ceil(rows.length*0.6));
  if(!anchor||anchor.support<minimumSupport) return [];
  // Preserve a repeated short first word (A Casa, O Carro, etc.). It must
  // share the name font/baseline and sit close to the established text column.
  const starts=rows.flatMap(({line,money},row)=>{
    const words=line.words.slice(0,money);
    const main=words.find(word=>Math.abs(word.bbox.x0-anchor.left)<=tolerance);
    if(!main) return [];
    const h=main.bbox.y1-main.bbox.y0;
    return words.filter(word=>word.bbox.x0<anchor.left-tolerance&&word.bbox.x0>=anchor.left-imageWidth*0.06
      &&Math.abs(word.bbox.y1-main.bbox.y1)<=h*0.25&&(word.bbox.y1-word.bbox.y0)<=h*1.4)
      .map(word=>({left:word.bbox.x0,row}));
  });
  for(const start of starts){
    const support=new Set(starts.filter(other=>Math.abs(start.left-other.left)<=tolerance).map(other=>other.row)).size;
    if(support>=minimumSupport){anchor.left=Math.min(anchor.left,start.left);break;}
  }
  const regions:SavingsPotLabelRegion[]=[];
  for(const {line,money} of rows){
    const amount=line.words[money];
    if(amount.bbox.x0<imageWidth*0.6) continue;
    const nameWords=line.words.slice(0,money).filter(word=>word.bbox.x0>=anchor.left-tolerance&&word.bbox.x1<amount.bbox.x0);
    const name=nameWords.map(word=>word.text).join(' ').normalize('NFKC').trim();
    const rowWords=[amount,...nameWords];
    const bbox={x0:Math.max(0,Math.floor(anchor.left-tolerance/2)),y0:Math.max(0,Math.min(...rowWords.map(word=>word.bbox.y0))-4),x1:Math.floor(amount.bbox.x0-tolerance),y1:Math.max(...rowWords.map(word=>word.bbox.y1))+4};
    if(bbox.x1<=bbox.x0||bbox.y1<=bbox.y0) continue;
    regions.push({originalLine:line.text.trim().normalize('NFKC'),name,moneyText:line.words.slice(money).map(word=>word.text).join(' '),bbox});
  }
  return regions;
}

export function applySavingsPotLabel(text:string,region:SavingsPotLabelRegion,name:string){
  const clean=name.normalize('NFKC').replace(/\s+/g,' ').trim();
  if(clean.length<1||clean.length>120||!/[\p{L}\p{N}]/u.test(clean)||/R\$|\n/.test(clean)) return text;
  return text.replace(region.originalLine,`${clean} ${region.moneyText}`);
}

export function chooseSavingsPotLabel(original:string,candidate:string,confidence:number){
  const clean=candidate.normalize('NFKC').replace(/\s+/g,' ').trim();
  if(confidence<75||!clean||clean.length>120||/R\$/.test(clean)||!/[\p{L}\p{N}]/u.test(clean)) return original;
  // A crop can improve separation while losing an accent already read clearly.
  // For equivalent letters, preserve whichever reading contains more diacritics.
  if(plain(original)===plain(clean)){
    const accents=(value:string)=>(value.normalize('NFD').match(/[\u0300-\u036f]/g)||[]).length;
    return accents(clean)>accents(original)?clean:original;
  }
  return clean;
}

export type PixelImage={width:number;height:number;data:Uint8ClampedArray};

/** Normalize an OCR currency word only when its last two glyphs are raised cents.
 * Pixels are copied from the evidence; no digit is supplied or guessed here.
 */
export function normalizeRaisedCents(image:PixelImage):PixelImage|null{
  const {width,height,data}=image;
  if(width<20||height<12||width*height>2_000_000||data.length!==width*height*4) return null;
  const dark=(x:number,y:number)=>{
    const at=(y*width+x)*4;
    return data[at+3]>128&&(data[at]+data[at+1]+data[at+2])/3<110;
  };
  const groups:Array<{left:number;right:number;top:number;bottom:number}>=[];
  let start=-1;
  for(let x=0;x<=width;x++){
    let has=false;
    if(x<width) for(let y=0;y<height;y++) if(dark(x,y)){has=true;break;}
    if(has&&start<0) start=x;
    if(!has&&start>=0){
      let top=height,bottom=0;
      for(let xx=start;xx<x;xx++) for(let y=0;y<height;y++) if(dark(xx,y)){top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
      groups.push({left:start,right:x,top,bottom});start=-1;
    }
  }
  // R, $, at least one integer digit and exactly two small trailing glyphs.
  if(groups.length<5||groups.length>12) return null;
  const integers=groups.slice(2,-2);
  const main=Math.max(...integers.map(g=>g.bottom-g.top));
  if(integers.some(g=>g.bottom-g.top<main*0.8)) return null;
  const cents=groups.slice(-2);
  if(cents.some(g=>(g.bottom-g.top)<main*0.3||(g.bottom-g.top)>main*0.78)) return null;
  const baseline=Math.max(...integers.map(g=>g.bottom));
  if(cents.some(g=>g.bottom>baseline-main*0.15)) return null;
  const glyphHeight=80,padding=12,gap=12;
  const widths=groups.map(g=>Math.max(1,Math.round((g.right-g.left)*glyphHeight/(g.bottom-g.top))));
  const outWidth=widths.reduce((a,b)=>a+b,0)+gap*(groups.length-1)+padding*2;
  const outHeight=glyphHeight+padding*2;
  const out=new Uint8ClampedArray(outWidth*outHeight*4).fill(255);
  let offset=padding;
  groups.forEach((g,i)=>{
    for(let y=0;y<glyphHeight;y++) for(let x=0;x<widths[i];x++){
      const fromX=g.left+Math.min(g.right-g.left-1,Math.floor(x*(g.right-g.left)/widths[i]));
      const fromY=g.top+Math.min(g.bottom-g.top-1,Math.floor(y*(g.bottom-g.top)/glyphHeight));
      if(!dark(fromX,fromY)) continue;
      const at=((y+padding)*outWidth+offset+x)*4;
      out[at]=0;out[at+1]=0;out[at+2]=0;
    }
    offset+=widths[i]+gap;
  });
  return {width:outWidth,height:outHeight,data:out};
}

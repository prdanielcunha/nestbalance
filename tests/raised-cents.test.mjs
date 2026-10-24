import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRaisedCents} from '../.core-dist/core/raised-cents.js';
function fixture(raised=true){
 const width=120,height=40,data=new Uint8ClampedArray(width*height*4).fill(255);
 for(let group=0;group<5;group++){
  const h=raised&&group>=3?18:32;
  for(let x=group*22+3;x<group*22+17;x++) for(let y=3;y<h+3;y++){
   const at=(y*width+x)*4; data[at]=data[at+1]=data[at+2]=0;
  }
 }
 return {width,height,data};
}
test('normalizes raised glyphs using only pixels from the source',()=>{
 const normalized=normalizeRaisedCents(fixture());
 assert.ok(normalized);assert.equal(normalized.height,104);
 assert.ok(normalized.data.every(x=>x===0||x===255));
});
test('does not reinterpret ordinary numbers as raised cents',()=>{
 assert.equal(normalizeRaisedCents(fixture(false)),null);
});
test('rejects blank, undersized and incomplete pixel input',()=>{
 assert.equal(normalizeRaisedCents({width:10,height:10,data:new Uint8ClampedArray(400)}),null);
 const blank=fixture();blank.data.fill(255);assert.equal(normalizeRaisedCents(blank),null);
 assert.equal(normalizeRaisedCents({width:100,height:100,data:new Uint8ClampedArray(4)}),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {savingsPotLabelRegions,applySavingsPotLabel,chooseSavingsPotLabel} from '../.core-dist/core/savings-pot-layout.js';
const word=(text,x0,x1)=>({text,bbox:{x0,x1,y0:100,y1:130}});
function rows(){return [
 {text:'Cofrinhos',words:[word('Cofrinhos',20,180)]},
 {text:'é Davi R$623,06',words:[word('é',60,130),word('Davi',230,315),word('R$623,06',1050,1260)]},
 {text:'DV Aniversário R$301,25',words:[word('DV',60,150),word('Aniversário',230,450),word('R$301,25',1050,1260)]},
 {text:'à Reservas R$223,05',words:[word('à',70,140),word('Reservas',231,410),word('R$223,05',1050,1260)]},
 {text:'A Casa R$100,22',words:[word('A',230,250),word('Casa',265,350),word('R$100,22',1050,1260)]},
 {text:'Studio Z R$16,71',words:[word('Studio',230,355),word('Z',370,390),word('R$16,71',1050,1260)]}
];}
test('uses repeated name-column geometry rather than icon-like letters',()=>{
 const regions=savingsPotLabelRegions(rows(),1320);
 assert.deepEqual(regions.map(x=>x.name),['Davi','Aniversário','Reservas','A Casa','Studio Z']);
 assert.deepEqual(regions.map(x=>x.moneyText),['R$623,06','R$301,25','R$223,05','R$100,22','R$16,71']);
});
test('preserves valid single-letter initials when aligned with names',()=>{
 const data=rows();data[1]={text:'É Davi R$623,06',words:[word('É',230,252),word('Davi',265,350),word('R$623,06',1050,1260)]};
 const regions=savingsPotLabelRegions(data,1320);
 assert.equal(regions[0].name,'É Davi');
});
test('does not guess a label column with insufficient layout evidence',()=>{
 assert.deepEqual(savingsPotLabelRegions(rows().slice(0,3),1320),[]);
 assert.deepEqual(savingsPotLabelRegions(rows().slice(1),1320),[]);
});
test('replaces only a label and preserves the exact visible monetary value',()=>{
 const source=rows().map(x=>x.text).join('\n');const region=savingsPotLabelRegions(rows(),1320)[0];
 const edited=applySavingsPotLabel(source,region,'Davi');
 assert.ok(edited.includes('Davi R$623,06'));assert.ok(!edited.includes('é Davi'));
 assert.ok(edited.includes('DV Aniversário R$301,25'));
 assert.equal(applySavingsPotLabel(source,region,'R$ 1000'),source);
});

test('preserves accents already read and accepts clearer diacritics from a crop',()=>{
 assert.equal(chooseSavingsPotLabel('Dízimo','Dizimo',95),'Dízimo');
 assert.equal(chooseSavingsPotLabel('Dizimo','Dízimo',95),'Dízimo');
 assert.equal(chooseSavingsPotLabel('Studio Z','Studio 2',40),'Studio Z');
});

test('keeps articles when every name begins with a short word',()=>{
 const data=[rows()[0],...['A Casa','O Carro','A Escola'].map(text=>({text:text+' R$100,00',words:[word(text[0],230,250),word(text.slice(2),265,400),word('R$100,00',1050,1260)]}))];
 assert.deepEqual(savingsPotLabelRegions(data,1320).map(x=>x.name),['A Casa','O Carro','A Escola']);
});

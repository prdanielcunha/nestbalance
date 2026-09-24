import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText, searchRecords } from '../.core-dist/core/search.js';

test('universal lexical search is accent and case insensitive',()=>{
  assert.equal(normalizeSearchText('Cartão São José'),'cartao sao jose');
  const results=searchRecords([
    {id:'1',type:'movement',label:'Mercado São José',secondary:'Alimentação'},
    {id:'2',type:'account',label:'Conta Principal',secondary:'Banco'}
  ],'sao jose');
  assert.deepEqual(results.map(item=>item.id),['1']);
});

test('all query tokens must be present and exact label ranks first',()=>{
  const results=searchRecords([
    {id:'1',type:'movement',label:'Internet Vivo',secondary:'119,90'},
    {id:'2',type:'commitment',label:'Vivo',secondary:'Internet mensal'},
    {id:'3',type:'account',label:'Internet',secondary:'Conta'}
  ],'internet vivo');
  assert.equal(results[0].id,'1');
  assert.equal(results.some(item=>item.id==='3'),false);
});

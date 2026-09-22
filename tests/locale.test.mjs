import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocale, parseLocale, localeForIntl } from '../.core-dist/core/locale.js';

test('normaliza idiomas suportados sem criar locale fantasma',()=>{
  assert.equal(normalizeLocale('pt'),'pt-BR');
  assert.equal(normalizeLocale('pt-PT'),'pt-BR');
  assert.equal(normalizeLocale('en-US'),'en');
  assert.equal(normalizeLocale('es-MX'),'es');
  assert.equal(normalizeLocale('fr-FR'),'pt-BR');
  assert.equal(parseLocale('fr-FR'),null);
});

test('mapeia locale estável para Intl',()=>{
  assert.equal(localeForIntl('pt-BR'),'pt-BR');
  assert.equal(localeForIntl('en'),'en-US');
  assert.equal(localeForIntl('es'),'es-ES');
});

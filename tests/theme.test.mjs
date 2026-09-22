import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTheme,themeColor,THEME_STORAGE_KEY} from '../.core-dist/core/theme.js';

test('dark is the official default theme',()=>{
  assert.equal(normalizeTheme(null),'dark');
  assert.equal(normalizeTheme(undefined),'dark');
  assert.equal(normalizeTheme('system'),'dark');
  assert.equal(themeColor('dark'),'#080B14');
  assert.equal(THEME_STORAGE_KEY,'nestbalance-theme');
});

test('light is only used after an explicit light preference',()=>{
  assert.equal(normalizeTheme('light'),'light');
  assert.equal(normalizeTheme('dark'),'dark');
  assert.equal(themeColor('light'),'#F3F5F9');
});

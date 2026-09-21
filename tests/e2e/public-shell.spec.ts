import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicRoutes=['/','/accounts','/movements','/vault','/assistant','/household','/privacy','/add'];

for(const route of publicRoutes){
  test(route+' unauthenticated shell is safe and usable',async({page})=>{
    await page.goto(route);
    await expect(page.getByRole('heading',{name:'NestBalance'})).toBeVisible();
    await expect(page.getByRole('button',{name:/Entrar com Google|Continue with Google/i})).toBeVisible();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('login shell has no serious accessibility violations',async({page})=>{
  await page.goto('/');
  const results=await new AxeBuilder({page}).analyze();
  const severe=results.violations.filter(item=>item.impact==='serious'||item.impact==='critical');
  expect(severe,severe.map(item=>item.id+': '+item.help).join('\n')).toEqual([]);
});

test('primary sign-in action is keyboard reachable',async({page})=>{
  await page.goto('/');
  await page.keyboard.press('Tab');
  for(let i=0;i<8;i++){
    const name=await page.evaluate(()=>document.activeElement?.textContent?.trim()||document.activeElement?.getAttribute('aria-label')||'');
    if(/Entrar com Google|Continue with Google/i.test(name)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Google sign-in was not reachable by keyboard within the first focusable controls.');
});

test('dark color scheme keeps login shell visible',async({browser})=>{
  const context=await browser.newContext({colorScheme:'dark',viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByRole('heading',{name:'NestBalance'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Entrar com Google|Continue with Google/i})).toBeVisible();
  await context.close();
});

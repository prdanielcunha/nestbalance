import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const authenticatedRoutes=[
  {path:'/?e2e=1',name:'home'},
  {path:'/movements?e2e=1',name:'movements'},
  {path:'/accounts?e2e=1',name:'accounts'},
  {path:'/pots?e2e=1',name:'pots'},
  {path:'/assistant?e2e=1',name:'assistant'},
  {path:'/add?e2e=1',name:'capture'}
];

for(const route of authenticatedRoutes){
  test('authenticated '+route.name+' is responsive, accessible and visually captured',async({page},testInfo)=>{
    await page.goto(route.path);
    await expect(page.locator('main')).toBeVisible();
    if(route.name==='capture'){
      await expect(page.getByRole('dialog',{name:'Jogue aqui. O NestBalance organiza.'})).toBeVisible();
    }else{
      await expect(page.getByText('NestBalance',{exact:true}).first()).toBeVisible();
    }

    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const results=await new AxeBuilder({page}).analyze();
    const severe=results.violations.filter(item=>item.impact==='serious'||item.impact==='critical');
    expect(severe,severe.map(item=>item.id+': '+item.help).join('\n')).toEqual([]);

    await page.screenshot({
      path:testInfo.outputPath(route.name+'-'+testInfo.project.name+'.png'),
      fullPage:true,
      animations:'disabled'
    });
  });
}

test('authenticated home exposes finance inbox, spendable money and balance freshness',async({page})=>{
  await page.goto('/?e2e=1');
  await expect(page.getByText('Disponível para gastar')).toBeVisible();
  await expect(page.getByText('INBOX FINANCEIRA')).toBeVisible();
  await expect(page.getByRole('region',{name:/\d+ (?:item|itens) para conferir/i})).toBeVisible();

  await page.goto('/accounts?e2e=1');
  await expect(page.getByText(/Atualizado agora|Há 8 dias sem atualização/).first()).toBeVisible();
});

test('authenticated empty and read-only states remain useful',async({page})=>{
  await page.goto('/?e2e=1&e2eFixture=empty');
  await expect(page.getByText(/Ainda não há saldo|Nenhum saldo/i).first()).toBeVisible();

  await page.goto('/?e2e=1&e2eRole=read_only');
  await expect(page.locator('.app-nav-add.readonly')).toBeVisible();
  await expect(page.locator('a.app-nav-add')).toHaveCount(0);
});

test('financial values can be hidden without losing navigation context',async({page})=>{
  await page.goto('/?e2e=1');
  const privacy=page.getByRole('button',{name:'Ocultar valores'});
  await expect(privacy).toBeVisible();
  await privacy.click();
  await expect(page.getByRole('button',{name:'Mostrar valores'})).toBeVisible();
  await expect(page.locator('.hero-balance>strong')).toContainText('••••');
  await page.reload();
  await expect(page.locator('.hero-balance>strong')).toContainText('••••');
});

test('authenticated home reflows at 200 percent zoom',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Run the zoom gate once on desktop.');
  await page.goto('/?e2e=1');
  await page.evaluate(()=>{document.documentElement.style.zoom='2';});
  await expect(page.getByText('Disponível para gastar')).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('authenticated primary navigation is keyboard reachable',async({page},testInfo)=>{
  test.skip(testInfo.project.name.startsWith('mobile-'),'Keyboard order is asserted on tablet/desktop projects.');
  await page.goto('/?e2e=1');
  let reached=false;
  for(let i=0;i<24;i++){
    await page.keyboard.press('Tab');
    const active=await page.evaluate(()=>({
      text:document.activeElement?.textContent?.trim()||'',
      label:document.activeElement?.getAttribute('aria-label')||''
    }));
    if(/Início|Movimentos|Cofrinhos|Assistente|Adicionar/i.test(active.text+' '+active.label)){
      reached=true;
      break;
    }
  }
  expect(reached).toBeTruthy();
});

test('authenticated light and dark modes both pass serious accessibility checks',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Run authenticated theme matrix once.');
  for(const theme of ['light','dark'] as const){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addInitScript(value=>localStorage.setItem('nestbalance-theme',value),theme);
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:4173/?e2e=1');
    await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.theme)).toBe(theme);
    const results=await new AxeBuilder({page}).analyze();
    const severe=results.violations.filter(item=>item.impact==='serious'||item.impact==='critical');
    expect(severe,severe.map(item=>item.id+': '+item.help).join('\n')).toEqual([]);
    await context.close();
  }
});

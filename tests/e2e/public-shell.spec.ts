import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicRoutes=['/','/accounts','/movements','/vault','/assistant','/household','/privacy','/add'];

for(const route of publicRoutes){
  test(route+' unauthenticated shell is safe and usable',async({page})=>{
    await page.goto(route);
    await expect(page.getByRole('heading',{name:'NestBalance'})).toBeVisible();
    await expect(page.getByRole('button',{name:/Entrar com Google|Continue with Google|Entrar con Google/i})).toBeVisible();
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

test('primary sign-in action is keyboard reachable',async({page},testInfo)=>{
  test.skip(testInfo.project.name.startsWith('mobile-'),'Keyboard focus is enforced on the desktop project; mobile has a touch-target gate.');
  await page.goto('/');
  await page.keyboard.press('Tab');
  for(let i=0;i<8;i++){
    const name=await page.evaluate(()=>document.activeElement?.textContent?.trim()||document.activeElement?.getAttribute('aria-label')||'');
    if(/Entrar com Google|Continue with Google|Entrar con Google/i.test(name)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Google sign-in was not reachable by keyboard within the first focusable controls.');
});

test('primary sign-in action has a 44px touch target on mobile',async({page},testInfo)=>{
  test.skip(!testInfo.project.name.startsWith('mobile-'),'Touch-target sizing is enforced on the mobile project.');
  await page.goto('/');
  const button=page.getByRole('button',{name:/Entrar com Google|Continue with Google|Entrar con Google/i});
  const box=await button.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('dark color scheme is intentional and accessible on mobile and desktop',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Run the dark matrix once; it creates both target viewports explicitly.');
  for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
    const context=await browser.newContext({colorScheme:'dark',viewport});
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await expect(page.getByRole('heading',{name:'NestBalance'})).toBeVisible();
    await expect(page.getByRole('button',{name:/Entrar com Google|Continue with Google|Entrar con Google/i})).toBeVisible();

    const tokens=await page.evaluate(()=>{
      const style=getComputedStyle(document.documentElement);
      return {
        paper:style.getPropertyValue('--paper').trim().toLowerCase(),
        ink:style.getPropertyValue('--ink').trim().toLowerCase(),
        surface:style.getPropertyValue('--surface-strong').trim().toLowerCase()
      };
    });
    expect(tokens.paper).toBe('#090d18');
    expect(tokens.ink).toBe('#edf0f6');
    expect(tokens.surface).toBe('#121725');

    const results=await new AxeBuilder({page}).analyze();
    const severe=results.violations.filter(item=>item.impact==='serious'||item.impact==='critical');
    expect(severe,severe.map(item=>item.id+': '+item.help).join('\n')).toEqual([]);

    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await context.close();
  }
});


test('PWA manifest is installable and references the NestBalance icon',async({request})=>{
  const response=await request.get('/manifest.webmanifest');
  expect(response.ok()).toBeTruthy();
  const manifest=await response.json();
  expect(manifest.name).toBe('NestBalance');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.scope).toBe('/');
  expect(Array.isArray(manifest.icons)).toBeTruthy();
  expect(manifest.icons.some((icon:any)=>icon.src==='/nestbalance-icon.svg'&&icon.type==='image/svg+xml')).toBeTruthy();
});

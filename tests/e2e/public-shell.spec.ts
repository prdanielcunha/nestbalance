import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicRoutes=['/','/accounts','/movements','/pots','/documents','/vault','/assistant','/household','/privacy','/add','/invite?token=test-invite'];

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

test('dark is the official default regardless of device color preference',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Run the theme matrix once; it creates target contexts explicitly.');
  for(const colorScheme of ['light','dark'] as const){
    for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
      const context=await browser.newContext({colorScheme,viewport});
      const page=await context.newPage();
      await page.goto('http://127.0.0.1:4173/');
      await expect(page.getByRole('heading',{name:'NestBalance'})).toBeVisible();

      const tokens=await page.evaluate(()=>{
        const style=getComputedStyle(document.documentElement);
        return {
          theme:document.documentElement.dataset.theme,
          paper:style.getPropertyValue('--paper').trim().toLowerCase(),
          ink:style.getPropertyValue('--ink').trim().toLowerCase(),
          surface:style.getPropertyValue('--surface-strong').trim().toLowerCase()
        };
      });
      expect(tokens.theme).toBe('dark');
      expect(tokens.paper).toBe('#090b10');
      expect(tokens.ink).toBe('#f5f1e8');
      expect(tokens.surface).toBe('#181e28');

      const results=await new AxeBuilder({page}).analyze();
      const severe=results.violations.filter(item=>item.impact==='serious'||item.impact==='critical');
      expect(severe,severe.map(item=>item.id+': '+item.help).join('\n')).toEqual([]);

      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await context.close();
    }
  }
});

test('explicit light preference persists and overrides the dark default',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Run the persisted light preference once.');
  const context=await browser.newContext({colorScheme:'dark',viewport:{width:390,height:844}});
  await context.addInitScript(()=>localStorage.setItem('nestbalance-theme','light'));
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByRole('heading',{name:'NestBalance'})).toBeVisible();

  const first=await page.evaluate(()=>{
    const style=getComputedStyle(document.documentElement);
    return {
      theme:document.documentElement.dataset.theme,
      paper:style.getPropertyValue('--paper').trim().toLowerCase(),
      ink:style.getPropertyValue('--ink').trim().toLowerCase(),
      surface:style.getPropertyValue('--surface-strong').trim().toLowerCase()
    };
  });
  expect(first.theme).toBe('light');
  expect(first.paper).toBe('#f7f3ea');
  expect(first.ink).toBe('#17191f');
  expect(first.surface).toBe('#ffffff');

  await page.reload();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.theme)).toBe('light');
  await context.close();
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
  expect(manifest.icons.some((icon:any)=>icon.src==='/icons/icon-192.png'&&icon.sizes==='192x192')).toBeTruthy();
  expect(manifest.icons.some((icon:any)=>icon.src==='/icons/maskable-icon-512.png'&&String(icon.purpose).includes('maskable'))).toBeTruthy();
});


test('PWA service worker controls the shell without caching API responses',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Service worker cache boundary is exercised once on desktop Chromium.');
  await page.goto('/');
  await page.evaluate(async()=>{
    if(!('serviceWorker' in navigator)) throw new Error('SERVICE_WORKER_UNAVAILABLE');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await page.evaluate(async()=>{
    try{ await fetch('/api/healthz',{method:'GET'}); }catch{}
  });
  const cachedUrls=await page.evaluate(async()=>{
    const keys=await caches.keys();
    const urls:string[]=[];
    for(const key of keys){
      const cache=await caches.open(key);
      const requests=await cache.keys();
      urls.push(...requests.map(request=>request.url));
    }
    return urls;
  });
  expect(cachedUrls.length).toBeGreaterThan(0);
  expect(cachedUrls.some(value=>new URL(value).pathname.startsWith('/api/'))).toBeFalsy();
  expect(cachedUrls.some(value=>new URL(value).pathname==='/')).toBeTruthy();
});

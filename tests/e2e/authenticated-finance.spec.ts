import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const fullHome={
  ok:true,
  accounts:[
    {id:'acc-1',name:'Conta principal',type:'bank',balanceMinor:845000,currency:'BRL',status:'active',scope:'household',institutionName:'Banco Exemplo',source:'manual',connectedProductType:null,connectionId:null,automaticallyInvestedMinor:null},
    {id:'acc-2',name:'Reserva investida',type:'bank',balanceMinor:1200000,currency:'BRL',status:'active',scope:'household',institutionName:'Banco Exemplo',source:'manual',connectedProductType:'investment',connectionId:null,automaticallyInvestedMinor:null}
  ],
  cards:[
    {id:'card-1',name:'Cartão da casa',brand:'mastercard',closingDay:20,dueDay:28,last4:'4242',limitMinor:500000,currency:'BRL',status:'active',scope:'household'}
  ],
  transactions:[
    {id:'tx-1',description:'Salário',amountMinor:650000,currency:'BRL',direction:'income',source:'manual',status:'confirmed',observedOn:'2026-09-05',scope:'household',category:null,categorySource:null},
    {id:'tx-2',description:'Mercado',amountMinor:43870,currency:'BRL',direction:'expense',source:'manual',status:'confirmed',observedOn:'2026-09-18',scope:'household',category:'food',categorySource:'user'},
    {id:'tx-3',description:'Farmácia',amountMinor:12990,currency:'BRL',direction:'expense',source:'credit_card_invoice',status:'confirmed',observedOn:'2026-09-19',scope:'household',cardId:'card-1',category:'health',categorySource:'learned'},
    {id:'tx-4',description:'Reserva da viagem',amountMinor:30000,currency:'BRL',direction:'transfer',source:'manual',status:'confirmed',observedOn:'2026-09-20',scope:'household',category:null,categorySource:null}
  ],
  commitments:[
    {id:'bill-1',description:'Internet',amountMinor:11990,currency:'BRL',direction:'expense',source:'manual',status:'confirmed',dueDay:24,recurring:true,recurrence:'monthly',paidThisMonth:false,scope:'household',category:'home',categorySource:'user'},
    {id:'bill-2',description:'Energia',amountMinor:23840,currency:'BRL',direction:'expense',source:'manual',status:'confirmed',dueDay:25,recurring:true,recurrence:'monthly',paidThisMonth:false,scope:'household',category:'home',categorySource:'user'}
  ],
  installmentPlans:[
    {id:'plan-1',description:'Geladeira',amountMinor:18900,currency:'BRL',status:'active',totalInstallments:10,lastObservedInstallment:3,anchorDueOn:'2026-09-28',lastObservedInvoiceKey:'2026-09',scope:'household'}
  ],
  invoiceImports:[
    {id:'inv-1',cardId:'card-1',invoiceKey:'2026-09',dueOn:'2026-09-28',status:'confirmed',confirmedAmountMinor:26790,paymentStatus:'unpaid',paidAmountMinor:0,paidOn:null,paidFromAccountId:null,scope:'household'}
  ],
  savingsPots:[
    {id:'pot-1',name:'Viagem',balanceMinor:225000,goalMinor:500000,targetDate:'2027-01-15',note:null,currency:'BRL',institutionName:'Banco Exemplo',source:'manual',trackingMode:'manual',hasCover:false,coverVersion:null,automation:null,status:'active',scope:'household'},
    {id:'pot-2',name:'Emergência',balanceMinor:380000,goalMinor:600000,targetDate:null,note:null,currency:'BRL',institutionName:'Carteira Exemplo',source:'screen_import',trackingMode:'bank_mirror',hasCover:false,coverVersion:null,automation:null,status:'active',scope:'household'}
  ],
  cardSnapshots:[],
  proactivityPreferences:{},
  dismissedAttentionKeys:[],
  dismissedRecurrenceKeys:[],
  refreshedAt:'2026-09-23T12:00:00.000Z'
};

const emptyHome={
  ...fullHome,
  accounts:[],
  cards:[],
  transactions:[],
  commitments:[],
  installmentPlans:[],
  invoiceImports:[],
  savingsPots:[],
  cardSnapshots:[]
};

async function mockAuthenticatedApi(page:Page,data:any=fullHome){
  await page.route('**/api/home',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}));
  await page.route('**/api/household/revision',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,revision:'1:test'})}));
  await page.route('**/api/savings-pots/automation/sync',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,processed:0})}));
}

async function gotoAuthenticated(page:Page,path='/',role='owner'){
  await page.goto(`${path}${path.includes('?')?'&':'?'}e2eAuth=1&e2eRole=${role}`);
  await expect(page.locator('main.app-shell')).toBeVisible();
  await expect(page.locator('.home-loading-line,.skeleton-line')).toHaveCount(0,{timeout:10_000}).catch(()=>undefined);
}

async function assertNoSeriousA11y(page:Page){
  const results=await new AxeBuilder({page}).analyze();
  const severe=results.violations.filter(item=>item.impact==='serious'||item.impact==='critical');
  expect(severe,severe.map(item=>item.id+': '+item.help).join('\n')).toEqual([]);
}

async function assertNoHorizontalOverflow(page:Page){
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('authenticated finance screens stay usable from 320px to desktop',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','The authenticated viewport matrix is created explicitly.');
  for(const viewport of [
    {width:320,height:720},
    {width:390,height:844},
    {width:768,height:1024},
    {width:1440,height:1000}
  ]){
    const context=await browser.newContext({viewport,colorScheme:'dark'});
    const page=await context.newPage();
    await mockAuthenticatedApi(page);
    await gotoAuthenticated(page,'/');
    await expect(page.locator('.hero-balance > strong')).toContainText('8.450');
    await assertNoHorizontalOverflow(page);
    await assertNoSeriousA11y(page);

    const accountsNav=page.locator('.app-nav-link.nav-accounts');
    if(viewport.width<=720) await expect(accountsNav).toBeHidden();
    else await expect(accountsNav).toBeVisible();

    await context.close();
  }
});

test('authenticated light and dark modes preserve contrast and layout',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Theme matrix is created explicitly.');
  for(const theme of ['dark','light'] as const){
    const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:theme});
    await context.addInitScript(selected=>localStorage.setItem('nestbalance-theme',selected),theme);
    const page=await context.newPage();
    await mockAuthenticatedApi(page);
    await gotoAuthenticated(page,'/accounts');
    await expect(page.getByRole('heading',{name:/R\$\s?8[.]450,00|8\.450,00/})).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNoSeriousA11y(page);
    await context.close();
  }
});

test('first-use authenticated Home teaches by action without overflowing',async({page})=>{
  await mockAuthenticatedApi(page,emptyHome);
  await gotoAuthenticated(page,'/');
  await expect(page.getByText(/Ainda não há saldo|Nenhum saldo/i).first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertNoSeriousA11y(page);
});

test('Cofrinhos clearly explain that reserving does not move bank money',async({page})=>{
  await mockAuthenticatedApi(page);
  await gotoAuthenticated(page,'/pots');
  await expect(page.getByRole('heading',{name:'Organizar não é movimentar seu banco.'})).toBeVisible();
  await expect(page.getByText('Viagem',{exact:true}).first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertNoSeriousA11y(page);
});

test('read-only member can browse but cannot use the central add action',async({page})=>{
  await mockAuthenticatedApi(page);
  await gotoAuthenticated(page,'/movements','read_only');
  await expect(page.locator('.app-nav-add[aria-disabled="true"]')).toBeVisible();
  await expect(page.locator('.app-nav-add[href="/add"]')).toHaveCount(0);
  await expect(page.getByText('Mercado',{exact:true}).first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertNoSeriousA11y(page);
});

test('keyboard reaches authenticated primary navigation and interactive controls',async({page},testInfo)=>{
  test.skip(testInfo.project.name.startsWith('mobile-'),'Keyboard navigation is enforced on desktop Chromium.');
  await mockAuthenticatedApi(page);
  await gotoAuthenticated(page,'/');
  let reached=false;
  for(let i=0;i<30;i++){
    await page.keyboard.press('Tab');
    reached=await page.evaluate(()=>document.activeElement?.classList.contains('app-nav-link')||document.activeElement?.classList.contains('app-nav-add')||false);
    if(reached) break;
  }
  expect(reached).toBeTruthy();
});

test('200% text scaling keeps the authenticated Home operable',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Text scaling is exercised once.');
  const context=await browser.newContext({viewport:{width:768,height:1000}});
  const page=await context.newPage();
  await mockAuthenticatedApi(page);
  await page.addInitScript(()=>{
    const style=document.createElement('style');
    style.textContent='html{font-size:200%!important}';
    document.documentElement.appendChild(style);
  });
  await gotoAuthenticated(page,'/');
  await assertNoHorizontalOverflow(page);
  await assertNoSeriousA11y(page);
  await context.close();
});

test('authenticated visual regression: Home mobile dark',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Snapshots are generated on the stable desktop Chromium project.');
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
  const page=await context.newPage();
  await mockAuthenticatedApi(page);
  await gotoAuthenticated(page,'/');
  await expect(page).toHaveScreenshot('authenticated-home-mobile-dark.png',{fullPage:true,animations:'disabled'});
  await context.close();
});

test('authenticated visual regression: Accounts desktop light',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Snapshots are generated on the stable desktop Chromium project.');
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
  await context.addInitScript(()=>localStorage.setItem('nestbalance-theme','light'));
  const page=await context.newPage();
  await mockAuthenticatedApi(page);
  await gotoAuthenticated(page,'/accounts');
  await expect(page).toHaveScreenshot('authenticated-accounts-desktop-light.png',{fullPage:true,animations:'disabled'});
  await context.close();
});

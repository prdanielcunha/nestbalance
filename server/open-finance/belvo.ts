import { Buffer } from 'node:buffer';

const DEFAULT_SANDBOX='https://sandbox.belvo.com';
const PROD='https://api.belvo.com';

function normalizedBase(){
  const explicit=process.env.BELVO_API_BASE_URL?.trim();
  if(explicit) return explicit.replace(/\/$/,'');
  return process.env.BELVO_ENVIRONMENT==='production'?PROD:DEFAULT_SANDBOX;
}

export function isBelvoConfigured(){
  return Boolean(process.env.BELVO_SECRET_ID?.trim()&&process.env.BELVO_SECRET_PASSWORD?.trim());
}

function authHeader(){
  const id=process.env.BELVO_SECRET_ID?.trim();
  const password=process.env.BELVO_SECRET_PASSWORD?.trim();
  if(!id||!password) throw Object.assign(new Error('OPEN_FINANCE_NOT_CONFIGURED'),{statusCode:503});
  return 'Basic '+Buffer.from(`${id}:${password}`).toString('base64');
}

async function jsonRequest(path:string,init:RequestInit={}){
  const response=await fetch(`${normalizedBase()}${path}`,{
    ...init,
    headers:{
      accept:'application/json',
      authorization:authHeader(),
      ...(init.body?{'content-type':'application/json'}:{}),
      ...(init.headers||{})
    }
  });
  const text=await response.text();
  let body:any=null;
  try{ body=text?JSON.parse(text):null; }catch{ body={raw:text}; }
  if(!response.ok){
    const err=Object.assign(new Error('OPEN_FINANCE_PROVIDER_ERROR'),{
      statusCode:response.status>=500?502:response.status,
      providerStatus:response.status,
      providerBody:body
    });
    throw err;
  }
  return body;
}

export async function createBelvoWidgetAccess(input:{
  cpf:string;
  legalName:string;
  externalId:string;
  callbackSuccess:string;
  callbackExit:string;
  callbackEvent:string;
  termsUrl:string;
  institution?:string;
}){
  const body={
    id:process.env.BELVO_SECRET_ID?.trim(),
    password:process.env.BELVO_SECRET_PASSWORD?.trim(),
    scopes:'read_institutions,write_links,read_consents,write_consents,write_consent_callback,delete_consents',
    stale_in:'300d',
    fetch_resources:['ACCOUNTS','TRANSACTIONS','OWNERS','BILLS'],
    widget:{
      purpose:'Organizar suas finanças pessoais, consolidar saldos, movimentações, faturas e investimentos autorizados por você.',
      openfinance_feature:'consent_link_creation',
      callback_urls:{
        success:input.callbackSuccess,
        exit:input.callbackExit,
        event:input.callbackEvent
      },
      consent:{
        terms_and_conditions_url:input.termsUrl,
        permissions:['REGISTER','ACCOUNTS','CREDIT_CARDS','CREDIT_OPERATIONS'],
        identification_info:[{type:'CPF',number:input.cpf,name:input.legalName}],
        default_consent_duration_days:366
      },
      branding:{
        company_icon:new URL('/nestbalance-icon.svg',input.termsUrl).toString(),
        company_logo:new URL('/nestbalance-logo.svg',input.termsUrl).toString(),
        company_name:'NestBalance',
        company_terms_url:input.termsUrl
      }
    }
  };

  const response=await fetch(`${normalizedBase()}/api/token/`,{
    method:'POST',
    headers:{accept:'application/json','content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const text=await response.text();
  let json:any=null;
  try{json=text?JSON.parse(text):null;}catch{json={raw:text};}
  if(!response.ok||typeof json?.access!=='string'){
    throw Object.assign(new Error('OPEN_FINANCE_WIDGET_FAILED'),{
      statusCode:response.status>=500?502:response.status||502,
      providerStatus:response.status,
      providerBody:json
    });
  }

  const params=new URLSearchParams({
    access_token:json.access,
    locale:'pt',
    integration_type:'openfinance',
    institution_types:'retail',
    country_codes:'BR',
    access_mode:'recurrent',
    external_id:input.externalId
  });
  if(input.institution) params.set('institutions',input.institution);

  return {
    widgetUrl:`https://widget.belvo.io/?${params.toString()}`,
    accessExpiresInSeconds:600
  };
}

export async function getBelvoLink(linkId:string){
  return jsonRequest(`/api/links/${encodeURIComponent(linkId)}/`);
}

export async function listBelvoAccounts(linkId:string){
  const body=await jsonRequest(`/api/accounts/?link=${encodeURIComponent(linkId)}`);
  return Array.isArray(body)?body:Array.isArray(body?.results)?body.results:[];
}

export async function listBelvoBalances(linkId:string){
  const body=await jsonRequest(`/api/br/balances/?link=${encodeURIComponent(linkId)}`);
  return Array.isArray(body)?body:Array.isArray(body?.results)?body.results:[];
}

export async function listBelvoTransactions(linkId:string){
  const body=await jsonRequest(`/api/transactions/?link=${encodeURIComponent(linkId)}&page_size=100`);
  return Array.isArray(body)?body:Array.isArray(body?.results)?body.results:[];
}


export async function deleteBelvoLink(linkId:string){
  const response=await fetch(`${normalizedBase()}/api/links/${encodeURIComponent(linkId)}/`,{
    method:'DELETE',
    headers:{
      accept:'application/json',
      authorization:authHeader()
    }
  });
  if(response.status===204) return {deleted:true};
  const text=await response.text();
  let body:any=null;
  try{body=text?JSON.parse(text):null;}catch{body={raw:text};}
  if(!response.ok){
    throw Object.assign(new Error('OPEN_FINANCE_PROVIDER_ERROR'),{
      statusCode:response.status>=500?502:response.status,
      providerStatus:response.status,
      providerBody:body
    });
  }
  return {deleted:true};
}

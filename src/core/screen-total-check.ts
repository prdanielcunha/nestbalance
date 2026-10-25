import type {AiFinancialScreenSnapshot} from './ai-financial.js';
export function screenTotalCheck(screen:AiFinancialScreenSnapshot){
 const sumMinor=screen.pots.reduce((sum,p)=>sum+p.balanceMinor,0);
 const totalMinor=screen.savingsTotalMinor??null;
 const comparable=screen.pots.length>0&&screen.pots.every(p=>p.currency==='BRL')&&totalMinor!==null;
 return {sumMinor,totalMinor,differenceMinor:comparable?sumMinor-totalMinor!:null,mismatch:comparable&&sumMinor!==totalMinor};
}

import type { AppLocale } from '@/src/core/locale';
import type { SavingsPotAutomation } from '@/src/core/savings-pot-automation';
import type { SavingsPotActivity } from '@/src/lib/repositories/savings-pots';

function l(locale:AppLocale,pt:string,en:string,es:string){
  return locale==='en'?en:locale==='es'?es:pt;
}

export function savingsPotAutomationLabel(value:SavingsPotAutomation|null|undefined,locale:AppLocale){
  if(!value?.enabled) return null;
  if(value.kind==='frequency'){
    const cadence=value.frequency==='daily'
      ? l(locale,'todo dia','every day','cada día')
      : value.frequency==='weekly'
        ? l(locale,'toda semana','every week','cada semana')
        : value.frequency==='biweekly'
          ? l(locale,'a cada 15 dias','every 15 days','cada 15 días')
          : l(locale,'todo mês','every month','cada mes');
    return l(locale,`Reserva automática ${cadence}`,`Automatic saving ${cadence}`,`Ahorro automático ${cadence}`);
  }
  if(value.kind==='roundup') return l(locale,'Arredonda seus gastos','Rounds up your spending','Redondea tus gastos');
  return value.kind==='spend'
    ? l(locale,'Reserva quando você gasta','Saves when you spend','Ahorra cuando gastas')
    : l(locale,'Reserva quando você recebe','Saves when money comes in','Ahorra cuando recibes');
}

export function savingsPotActivityLabel(activity:SavingsPotActivity,locale:AppLocale){
  if(activity.type==='reserve') return l(locale,'Você reservou','You saved','Reservaste');
  if(activity.type==='withdraw') return l(locale,'Você retirou','You withdrew','Retiraste');
  if(activity.type==='automatic_reserve') return l(locale,'Reserva automática','Automatic saving','Ahorro automático');
  if(activity.type==='screen_sync') return l(locale,'Atualizado por print','Updated from screenshot','Actualizado por captura');
  if(activity.type==='created') return l(locale,'Cofrinho criado','Savings pot created','Alcancía creada');
  if(activity.type==='balance_adjustment') return l(locale,'Saldo ajustado','Balance adjusted','Saldo ajustado');
  return l(locale,'Atualização','Update','Actualización');
}

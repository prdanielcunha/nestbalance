import type { AppLocale } from '@/src/core/locale';
import type { HouseholdRole } from '@/src/core/household';

function l(locale:AppLocale,pt:string,en:string,es:string){
  return locale==='en'?en:locale==='es'?es:pt;
}

export function householdRoleName(role:HouseholdRole,locale:AppLocale){
  return ({
    owner:l(locale,'Titular','Owner','Titular'),
    admin:l(locale,'Sócio · acesso total','Partner · full access','Socio · acceso total'),
    manager:l(locale,'Gestor financeiro','Financial manager','Gestor financiero'),
    member:l(locale,'Colaborador','Contributor','Colaborador'),
    read_only:l(locale,'Visualizador','Viewer','Visualizador')
  } as const)[role];
}

export function householdRoleDescription(role:Exclude<HouseholdRole,'owner'>,locale:AppLocale){
  return ({
    admin:l(
      locale,
      'Pode alterar dados, contas, cartões, cofrinhos, configurações, conexões e acessos. Só não pode remover o Titular nem excluir o Lar.',
      'Can change data, accounts, cards, savings pots, settings, connections, and access. The Owner remains protected, and only the Owner can delete the Household.',
      'Puede cambiar datos, cuentas, tarjetas, alcancías, configuración, conexiones y accesos. El Titular queda protegido y solo el Titular puede borrar el Hogar.'
    ),
    manager:l(
      locale,
      'Pode organizar toda a parte financeira e conexões, mas não convida pessoas nem altera permissões ou configurações do Lar.',
      'Can manage all financial data and connections, but cannot invite people or change permissions or Household settings.',
      'Puede gestionar toda la parte financiera y conexiones, pero no invita personas ni cambia permisos o configuración del Hogar.'
    ),
    member:l(
      locale,
      'Pode adicionar e atualizar movimentos, contas recorrentes, documentos e cofrinhos compartilhados, sem administrar acessos.',
      'Can add and update activities, recurring bills, documents, and shared savings pots without managing access.',
      'Puede agregar y actualizar movimientos, cuentas recurrentes, documentos y alcancías compartidas sin administrar accesos.'
    ),
    read_only:l(
      locale,
      'Pode ver os dados compartilhados, saldos, contas e documentos, sem alterar nada.',
      'Can view shared data, balances, bills, and documents without changing anything.',
      'Puede ver datos compartidos, saldos, cuentas y documentos sin cambiar nada.'
    )
  } as const)[role];
}

export function householdActivityText(
  type:string,
  target:string,
  scope:'household'|'personal',
  locale:AppLocale
){
  if(locale==='en'){
    if(type==='household.renamed') return 'updated the household name.';
    if(type==='household.locale_changed') return 'changed the household language.';
    if(type==='household.invite_created') return 'created a household invite.';
    if(type==='household.invite_revoked') return 'cancelled a household invite.';
    if(type==='household.member_role_changed') return `changed access for ${target}.`;
    if(type==='household.member_removed') return `removed ${target} from the household.`;
    if(type==='recurrence.confirmed') return 'confirmed a monthly recurring item.';
    if(type==='member.proactivity_preferences_updated') return 'updated personal attention preferences.';
    if(type.startsWith('capture.')) return scope==='personal'?'added a private financial record.':'added a household financial record.';
    if(type.includes('payment')) return 'updated a payment.';
    if(type.includes('invoice')) return 'updated a card statement.';
    if(type.includes('account')) return 'updated an account.';
    return 'made an important household update.';
  }
  if(locale==='es'){
    if(type==='household.renamed') return 'actualizó el nombre del hogar.';
    if(type==='household.locale_changed') return 'cambió el idioma del hogar.';
    if(type==='household.invite_created') return 'creó una invitación al hogar.';
    if(type==='household.invite_revoked') return 'canceló una invitación al hogar.';
    if(type==='household.member_role_changed') return `cambió el acceso de ${target}.`;
    if(type==='household.member_removed') return `eliminó a ${target} del hogar.`;
    if(type==='recurrence.confirmed') return 'confirmó un gasto mensual recurrente.';
    if(type==='member.proactivity_preferences_updated') return 'actualizó sus preferencias personales de atención.';
    if(type.startsWith('capture.')) return scope==='personal'?'agregó un registro financiero privado.':'agregó un registro financiero del hogar.';
    if(type.includes('payment')) return 'actualizó un pago.';
    if(type.includes('invoice')) return 'actualizó un resumen de tarjeta.';
    if(type.includes('account')) return 'actualizó una cuenta.';
    return 'hizo una actualización importante en el hogar.';
  }
  if(type==='household.renamed') return 'atualizou o nome do Lar.';
  if(type==='household.locale_changed') return 'alterou o idioma do Lar.';
  if(type==='household.invite_created') return 'criou um convite para o Lar.';
  if(type==='household.invite_revoked') return 'cancelou um convite do Lar.';
  if(type==='household.member_role_changed') return `alterou o acesso de ${target}.`;
  if(type==='household.member_removed') return `removeu ${target} do Lar.`;
  if(type==='recurrence.confirmed') return 'confirmou um item recorrente mensal.';
  if(type==='member.proactivity_preferences_updated') return 'atualizou suas preferências pessoais de atenção.';
  if(type.startsWith('capture.')) return scope==='personal'?'adicionou um registro financeiro pessoal.':'adicionou um registro financeiro do Lar.';
  if(type.includes('payment')) return 'atualizou um pagamento.';
  if(type.includes('invoice')) return 'atualizou uma fatura.';
  if(type.includes('account')) return 'atualizou uma conta.';
  return 'fez uma atualização importante no Lar.';
}

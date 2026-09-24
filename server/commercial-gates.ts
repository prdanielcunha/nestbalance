import { isBelvoConfigured, paidOpenFinanceEnabled } from './open-finance/belvo.js';

function flag(name:string){
  return process.env[name]==='true';
}

export function openFinanceGateStatus(){
  const providerConfigured=isBelvoConfigured();
  const paidIntegrationsAllowed=paidOpenFinanceEnabled();
  const contractApproved=flag('NESTBALANCE_OPEN_FINANCE_CONTRACT_APPROVED');
  const variableCostApproved=flag('NESTBALANCE_OPEN_FINANCE_COST_APPROVED');
  const consentCertified=flag('NESTBALANCE_OPEN_FINANCE_CONSENT_CERTIFIED');
  const revocationCertified=flag('NESTBALANCE_OPEN_FINANCE_REVOCATION_CERTIFIED');
  const reconciliationCertified=flag('NESTBALANCE_OPEN_FINANCE_RECONCILIATION_CERTIFIED');
  const commerciallyReady=providerConfigured&&paidIntegrationsAllowed&&contractApproved&&variableCostApproved&&consentCertified&&revocationCertified&&reconciliationCertified;
  return {
    commerciallyReady,
    providerConfigured,
    paidIntegrationsAllowed,
    contractApproved,
    variableCostApproved,
    consentCertified,
    revocationCertified,
    reconciliationCertified,
    executableRoutesEnabled:false
  };
}

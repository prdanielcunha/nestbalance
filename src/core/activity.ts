export type ActivityPrivacyInput={
  scope?:unknown;
  actorUid?:unknown;
};

export function canSeeHouseholdActivity(input:ActivityPrivacyInput,viewerUid:string){
  if(input.scope!=='personal') return true;
  return typeof input.actorUid==='string'&&input.actorUid===viewerUid;
}

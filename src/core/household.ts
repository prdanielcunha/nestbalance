export type HouseholdRole = 'owner' | 'admin' | 'member' | 'read_only';

export type HouseholdCapability =
  | 'read'
  | 'contribute'
  | 'manage_finance'
  | 'manage_connections'
  | 'manage_household'
  | 'owner';

const capabilities: Record<HouseholdRole, readonly HouseholdCapability[]> = {
  owner: ['read','contribute','manage_finance','manage_connections','manage_household','owner'],
  admin: ['read','contribute','manage_finance','manage_connections','manage_household'],
  member: ['read','contribute'],
  read_only: ['read']
};

export function normalizeHouseholdRole(value: unknown): HouseholdRole {
  return value === 'owner' || value === 'admin' || value === 'member' || value === 'read_only'
    ? value
    : 'read_only';
}

export function canHouseholdRole(role: HouseholdRole, capability: HouseholdCapability) {
  return capabilities[role].includes(capability);
}

export function isAssignableHouseholdRole(value: unknown): value is Exclude<HouseholdRole,'owner'> {
  return value === 'admin' || value === 'member' || value === 'read_only';
}

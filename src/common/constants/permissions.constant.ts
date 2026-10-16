export const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_MANAGE: 'users:manage',
  AUTH_ME: 'auth:me',
} as const;

export const SEED_PERMISSIONS = Object.values(PERMISSIONS);

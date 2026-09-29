import { ROLE_DEFAULT_PERMISSIONS } from './constants.js';

/**
 * A user's effective permissions = their role's default permissions UNION
 * their own explicit grants. This is the single place that merge happens —
 * every permission check (middleware, controllers, auth response) goes
 * through this so the rule is never duplicated.
 */
export function getEffectivePermissions(user) {
  const roleDefaults = ROLE_DEFAULT_PERMISSIONS[user?.role] || [];
  const explicit = user?.permissions || [];
  return Array.from(new Set([...roleDefaults, ...explicit]));
}

export function hasPermission(user, permission) {
  return getEffectivePermissions(user).includes(permission);
}

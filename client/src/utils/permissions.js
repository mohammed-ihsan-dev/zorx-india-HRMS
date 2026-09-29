/**
 * The backend already resolves role-default + explicit permissions into a
 * single array on the auth user (see server getEffectivePermissions) — this
 * just reads it, so permission logic lives in exactly one place, not
 * duplicated per component.
 */
export function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

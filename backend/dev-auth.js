const VALID_ROLES = new Set(["superadmin", "admin", "developer", "viewer"]);

export function requireDevRole(...allowedRoles) {
  const allowed = new Set(allowedRoles.flat().map(role => String(role).toLowerCase()));
  if (!allowed.size || [...allowed].some(role => !VALID_ROLES.has(role))) {
    throw new TypeError("requireDevRole needs one or more valid developer roles.");
  }
  return function devRoleGuard(req, res, next) {
    const role = String(req.devRole || "").toLowerCase();
    if (!VALID_ROLES.has(role) || !allowed.has(role)) {
      return res.status(403).json({ error: "Insufficient developer permissions." });
    }
    return next();
  };
}

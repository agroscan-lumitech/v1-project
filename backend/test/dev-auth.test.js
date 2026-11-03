import test from "node:test";
import assert from "node:assert/strict";
import { requireDevRole } from "../dev-auth.js";

function invoke(role, allowed) {
  let status = null, payload = null, continued = false;
  const req = { devRole: role };
  const res = { status(code) { status = code; return this; }, json(body) { payload = body; return this; } };
  requireDevRole(...allowed)(req, res, () => { continued = true; });
  return { status, payload, continued };
}

test("admin-only guard accepts admins and superadmins", () => {
  assert.equal(invoke("admin", ["admin", "superadmin"]).continued, true);
  assert.equal(invoke("superadmin", ["admin", "superadmin"]).continued, true);
});
test("admin-only guard rejects developers, viewers and missing roles", () => {
  for (const role of ["developer", "viewer", undefined]) {
    const result = invoke(role, ["admin", "superadmin"]);
    assert.equal(result.status, 403);
    assert.equal(result.continued, false);
  }
});
test("role matching is case-insensitive", () => assert.equal(invoke("ADMIN", ["admin"]).continued, true));
test("invalid role policy is rejected", () => assert.throws(() => requireDevRole("owner"), /valid developer roles/));

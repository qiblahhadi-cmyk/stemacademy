import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../../netlify/functions/api.mjs";

// Without a bearer token each request stops at authenticate(), so these tests prove
// the routes are reached and protected without importing firebase-admin.
const status = async (method, path) =>
  (await handler(new Request(`https://example.test${path}`, { method }), {})).status;

test("assessment endpoints are routed and require authentication", async () => {
  assert.equal(await status("GET", "/api/assessments?classId=c&subjectId=s"), 401);
  assert.equal(await status("POST", "/api/assessments"), 401);
  assert.equal(await status("GET", "/api/assessments/abc"), 401);
  assert.equal(await status("PATCH", "/api/assessments/abc"), 401);
  assert.equal(await status("POST", "/api/assessments/abc/publish"), 401);
  assert.equal(await status("POST", "/api/assessments/abc/start"), 401);
  assert.equal(await status("POST", "/api/assessments/abc/submit"), 401);
  assert.equal(await status("GET", "/api/assessments/abc/results"), 401);
  assert.equal(await status("POST", "/api/assessments/abc/results/approve"), 401);
  assert.equal(await status("POST", "/api/assessments/abc/results/release"), 401);
  assert.equal(await status("POST", "/api/assessments/abc/retakes"), 401);
});

test("similarly named paths are not routed to assessments", async () => {
  assert.equal(await status("GET", "/api/assessments-archive"), 404);
});

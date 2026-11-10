import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../../netlify/functions/api.mjs";

// No bearer token: each request stops at authenticate(), so these tests prove the
// routes are reached and protected without importing firebase-admin.
const base = "https://example.test";
const status = async (method, path) =>
  (await handler(new Request(`${base}${path}`, { method }), {})).status;

test("attendance endpoints are routed and require authentication", async () => {
  assert.equal(await status("GET", "/api/attendance?classId=c"), 401);
  assert.equal(await status("POST", "/api/attendance/mark"), 401);
  assert.equal(await status("POST", "/api/attendance/correct"), 401);
  assert.equal(await status("GET", "/api/attendance/corrections?classId=c"), 401);
});

test("subjects endpoint is routed and requires authentication", async () => {
  assert.equal(await status("GET", "/api/subjects?classId=c"), 401);
});

test("similarly named paths are not routed to attendance", async () => {
  assert.equal(await status("GET", "/api/attendance-report"), 404);
});

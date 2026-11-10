import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../../netlify/functions/api.mjs";
const base = "https://example.test";
async function status(method, path) { return (await handler(new Request(`${base}${path}`, { method }), {})).status; }
test("assignment submission routes require authentication", async () => {
  assert.equal(await status("POST", "/api/assignment-submissions"), 401);
  assert.equal(await status("GET", "/api/assignment-submissions?assignmentId=a"), 401);
  assert.equal(await status("PATCH", "/api/assignment-submissions/as_x/review"), 401);
});
test("curriculum routes require authentication", async () => {
  assert.equal(await status("GET", "/api/curriculum/chapters?classId=c&subjectId=s"), 401);
  assert.equal(await status("POST", "/api/curriculum/chapters"), 401);
  assert.equal(await status("POST", "/api/curriculum/topics/id/publish"), 401);
});
test("unrelated similarly prefixed paths are not routed to Phase 5 endpoints", async () => {
  assert.equal(await status("GET", "/api/assignment-submissions-archive"), 404);
  assert.equal(await status("GET", "/api/curriculum-preview"), 404);
});

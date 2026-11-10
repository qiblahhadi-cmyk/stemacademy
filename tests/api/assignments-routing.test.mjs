import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../../netlify/functions/api.mjs";

// These requests carry no bearer token, so they stop at authenticate() before
// any Firebase Admin import. They prove that /assignments is routed to the
// protected workflow and that authentication is enforced on every method.

const base = "https://example.test";

async function status(method, path) {
  const response = await handler(new Request(`${base}${path}`, { method }), {});
  return response.status;
}

test("assignment list is routed and requires authentication", async () => {
  assert.equal(await status("GET", "/api/assignments?classId=c&subjectId=s"), 401);
});

test("assignment writes are routed and require authentication", async () => {
  assert.equal(await status("POST", "/api/assignments"), 401);
  assert.equal(await status("PATCH", "/api/assignments/abc"), 401);
  assert.equal(await status("POST", "/api/assignments/abc/publish"), 401);
  assert.equal(await status("POST", "/api/assignments/abc/close"), 401);
});

test("versioned assignment path is routed the same way", async () => {
  assert.equal(await status("GET", "/api/v1/assignments?classId=c&subjectId=s"), 401);
});

test("paths that merely start with the same letters are not routed to assignments", async () => {
  assert.equal(await status("GET", "/api/assignments-archive"), 404);
});

test("health endpoint remains public and unaffected", async () => {
  const response = await handler(new Request(`${base}/api/health`, { method: "GET" }), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "operational");
});

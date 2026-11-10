import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../../netlify/functions/api.mjs";

test("health endpoint returns a no-cache JSON success response", async () => {
  const response = await handler(new Request("https://example.test/api/health"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.application, "STEM Academy");
});

test("unknown API routes return a structured 404 response", async () => {
  const response = await handler(new Request("https://example.test/api/v1/not-a-route"));
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.code, "NOT_FOUND");
});

test("health endpoint is method-specific", async () => {
  const response = await handler(new Request("https://example.test/api/health", { method: "POST" }));
  assert.equal(response.status, 404);
});

test("protected session endpoint rejects unsupported methods without Firebase", async () => {
  const response = await handler(new Request("https://example.test/api/me", { method: "POST" }));
  assert.equal(response.status, 405);
  const body = await response.json();
  assert.equal(body.error.code, "METHOD_NOT_ALLOWED");
});

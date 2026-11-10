import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../public/activity-logs.html", import.meta.url), "utf8");
const script = await readFile(new URL("../../public/assets/js/activity-logs.js", import.meta.url), "utf8");

test("activity logs page no longer presents fictional or in-memory data", () => {
  assert.doesNotMatch(html, /fictional|demo|sample|coming soon|not an audit log|Reset demo/i);
  assert.doesNotMatch(html, /data-sample-notice/);
  assert.doesNotMatch(script, /initialActivities|Physics Teacher|Academy Admin|resetActivity/);
  assert.doesNotMatch(script, /2026-11-0\d/);
});

test("activity logs page loads data only from the administrator audit endpoint", () => {
  assert.match(script, /\/admin\/audit-logs\?/);
  assert.match(script, /StemSession\.apiFetch/);
  assert.doesNotMatch(script, /method:\s*["'](POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(script, /firebase|firestore|localStorage|sessionStorage/i);
});

test("audit values are rendered as text, never as HTML", () => {
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  assert.match(script, /textContent/);
});

test("the page script loads after the session bundle and exposes the filters", () => {
  assert.ok(html.indexOf("/assets/js/bundles/session.js") < html.indexOf("/assets/js/activity-logs.js"));
  for (const id of ["activitySearch", "categoryFilter", "roleFilter", "fromDate", "toDate", "loadMore", "emptyActivity", "activityError"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

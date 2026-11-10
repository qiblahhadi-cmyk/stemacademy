import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFile(path.join(root, file), "utf8");
const PAGES = ["public/classes.html", "public/index.html", "public/profile.html"];
const SCRIPTS = ["public/assets/js/classes.js", "public/assets/js/dashboard.js", "public/assets/js/profile.js"];

test("the three people pages contain no sample, demo or preview wording", async () => {
  for (const page of PAGES) {
    const html = await read(page);
    assert.doesNotMatch(html, /sample|demo|illustrative|fictional|temporary|preview|example\.invalid/i, `${page} still has placeholder wording`);
  }
  for (const script of SCRIPTS) {
    assert.doesNotMatch(await read(script), /sample|demo|illustrative|fictional/i, `${script} still has placeholder wording`);
  }
});

test("classes page starts with blank statistics and no fixed numbers", async () => {
  const html = await read("public/classes.html");
  for (const id of ["gradeCount", "classCount", "studentCount", "teacherCount"]) {
    assert.match(html, new RegExp(`id="${id}">—<`), `#${id} must start blank`);
  }
  assert.doesNotMatch(html, /<strong id="(gradeCount|classCount|studentCount|teacherCount)">\d/);
});

test("classes page no longer offers demo record creation or the fictional teacher panel", async () => {
  const html = await read("public/classes.html");
  assert.doesNotMatch(html, /recordDialog|addButton|Sample Teacher|assignment-panel/);
});

test("dashboard has no hard-coded figures or fabricated panels", async () => {
  const html = await read("public/index.html");
  assert.match(html, /<div class="stats-grid" id="statsGrid" hidden><\/div>/);
  assert.doesNotMatch(html, /Pending work|Today's attendance|Development progress|Active students<\/span>/);
});

test("profile page exposes no email field and no fictional values", async () => {
  const html = await read("public/profile.html");
  assert.doesNotMatch(html, /profileEmail|Preview profile update|Academy Admin|admin@/);
  assert.doesNotMatch(html, /value="[^"]*Academy Admin/);
});

test("profile page form has exactly one editable field: display name", async () => {
  const html = await read("public/profile.html");
  const form = html.match(/<form id="profileForm"[\s\S]*?<\/form>/)[0];
  const editable = [...form.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].filter((m) => !/\bdisabled\b/.test(m[2]));
  assert.equal(editable.length, 1);
  assert.match(editable[0][2], /id="displayName"/);
});

test("classes script reads roster data from the server for each visible class", async () => {
  const js = await read("public/assets/js/classes.js");
  assert.match(js, /apiFetch\("\/classes"\)/);
  assert.match(js, /\/classes\/\$\{encodeURIComponent\(item\.id\)\}\/roster/);
});

test("dashboard script reads only the role-scoped dashboard endpoint", async () => {
  const js = await read("public/assets/js/dashboard.js");
  assert.match(js, /apiFetch\("\/dashboard"\)/);
  assert.doesNotMatch(js, /apiFetch\("\/classes"\)/);
});

test("profile script sends only displayName to the server", async () => {
  const js = await read("public/assets/js/profile.js");
  const bodies = [...js.matchAll(/body:\s*(\{[^}]*\})/g)].map((m) => m[1]);
  assert.deepEqual(bodies, ["{ displayName: value }"]);
  assert.match(js, /apiFetch\("\/me", \{ method: "PATCH"/);
});

test("people pages load the session bundle before their own scripts", async () => {
  for (const page of ["public/classes.html", "public/profile.html", "public/index.html"]) {
    const html = await read(page);
    const session = html.indexOf("/assets/js/bundles/session.js");
    assert.ok(session > -1, `${page} must load the session bundle`);
  }
});

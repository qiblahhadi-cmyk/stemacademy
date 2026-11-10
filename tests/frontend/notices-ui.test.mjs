import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOTICE_PRIORITIES as API_PRIORITIES } from "../../netlify/functions/lib/routes/notices.mjs";
import { buildNoticePayload, priorityForEditor, NOTICE_PRIORITIES } from "../../public/assets/js/notice-form.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pageHtml = await readFile(path.join(root, "public/communication.html"), "utf8");
const pageScript = await readFile(path.join(root, "public/assets/js/communication.js"), "utf8");

function optionValuesOf(selectId) {
  const select = pageHtml.match(new RegExp(`<select[^>]*\\bid="${selectId}"[^>]*>([\\s\\S]*?)</select>`));
  assert.ok(select, `#${selectId} is missing`);
  return [...select[1].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map((match) => {
    const value = match[1].match(/\bvalue="([^"]*)"/);
    assert.ok(value, `option "${match[2]}" in #${selectId} has no explicit value attribute`);
    return value[1];
  });
}

test("the shared priority enum is exactly the API enum", () => {
  assert.deepEqual([...NOTICE_PRIORITIES], [...API_PRIORITIES]);
  assert.deepEqual([...API_PRIORITIES], ["normal", "important"]);
});

test("every notice priority dropdown value is an API-supported priority", () => {
  for (const value of optionValuesOf("noticeLevel")) {
    assert.ok(API_PRIORITIES.includes(value), `#noticeLevel value "${value}" is not an API priority`);
  }
  assert.deepEqual(optionValuesOf("noticeLevel"), [...API_PRIORITIES]);
});

test("the priority filter offers All plus the exact API priorities", () => {
  assert.deepEqual(optionValuesOf("noticePriority"), ["all", ...API_PRIORITIES]);
});

test("the notice form no longer contains the discarded notice-date field", () => {
  assert.doesNotMatch(pageHtml, /noticeDate/);
  assert.doesNotMatch(pageScript, /noticeDate/);
});

test("temporary demo wording is removed from the real notice interface", () => {
  assert.doesNotMatch(pageHtml, /TEMPORARY DEMO/i);
  assert.doesNotMatch(pageScript, /TEMPORARY DEMO/i);
});

test("notice statistics start blank, not with fabricated counts", () => {
  for (const id of ["noticeTotal", "academyTotal", "classTotal", "priorityTotal"]) {
    const value = pageHtml.match(new RegExp(`id="${id}">([^<]*)<`))?.[1];
    assert.equal(value, "—", `#${id} should start blank until real data loads`);
  }
});

test("communication.js uses the shared form module as an ES module", () => {
  assert.match(pageHtml, /<script type="module" src="\/assets\/js\/communication\.js"><\/script>/);
  assert.match(pageScript, /from "\.\/notice-form\.js"/);
});

test("create payload carries the scope and class, and the priority value", () => {
  assert.deepEqual(
    buildNoticePayload({ editing: false, target: "academy", title: " Closure ", body: " Tomorrow. ", priority: "important" }),
    { title: "Closure", body: "Tomorrow.", priority: "important", scope: "academy" }
  );
  assert.deepEqual(
    buildNoticePayload({ editing: false, target: "class:grade-9", title: "Lab", body: "Bring goggles", priority: "normal" }),
    { title: "Lab", body: "Bring goggles", priority: "normal", scope: "class", classId: "grade-9" }
  );
});

test("edit payload never includes scope or classId, which the API refuses on update", () => {
  const payload = buildNoticePayload({ editing: true, target: "class:grade-9", title: "Lab", body: "Goggles", priority: "important" });
  assert.deepEqual(payload, { title: "Lab", body: "Goggles", priority: "important" });
  assert.equal("scope" in payload, false);
  assert.equal("classId" in payload, false);
});

test("the edit dialog selects the saved priority and falls back to normal for unknown values", () => {
  assert.equal(priorityForEditor({ priority: "important" }), "important");
  assert.equal(priorityForEditor({ priority: "normal" }), "normal");
  assert.equal(priorityForEditor({ priority: "Important" }), "normal");
  assert.equal(priorityForEditor(null), "normal");
});

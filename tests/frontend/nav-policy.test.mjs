import test from "node:test";
import assert from "node:assert/strict";
import { canViewPage, pageKey, PAGE_POLICY } from "../../src/client/nav-policy.js";

test("pageKey maps URLs to page names", () => {
  assert.equal(pageKey("/assignments.html"), "assignments.html");
  assert.equal(pageKey("/"), "index.html");
  assert.equal(pageKey("/assignments.html?x=1#top"), "assignments.html");
  assert.equal(pageKey(""), "index.html");
});

test("students may open shared learning pages but not staff-only pages", () => {
  assert.equal(canViewPage("student", "assignments.html"), true);
  assert.equal(canViewPage("student", "course-hub.html"), false);
  assert.equal(canViewPage("student", "classes.html"), false);
  assert.equal(canViewPage("student", "attendance.html"), false);
  assert.equal(canViewPage("student", "settings.html"), false);
  assert.equal(canViewPage("student", "activity-logs.html"), false);
});

test("teachers may open staff pages but not administration pages", () => {
  assert.equal(canViewPage("teacher", "assignments.html"), true);
  assert.equal(canViewPage("teacher", "attendance.html"), true);
  assert.equal(canViewPage("teacher", "settings.html"), false);
  assert.equal(canViewPage("teacher", "activity-logs.html"), false);
  assert.equal(canViewPage("teacher", "role-preview.html"), false);
  assert.equal(canViewPage("teacher", "admin-management.html"), false);
});

test("administrators may open mapped pages except the owner-hidden Course Hub", () => {
  for (const page of Object.keys(PAGE_POLICY)) {
    assert.equal(canViewPage("admin", page), !["course-hub.html", "my-attendance.html"].includes(page), `unexpected policy for ${page}`);
  }
  assert.equal(canViewPage("admin", "course-hub.html"), false);
  assert.equal(canViewPage("admin", "admin-management.html"), true);
  assert.equal(canViewPage("student", "activate-account.html"), true);
  assert.equal(canViewPage("teacher", "activate-account.html"), true);
});

test("unknown pages are denied to everyone except administrators", () => {
  assert.equal(canViewPage("student", "secret.html"), false);
  assert.equal(canViewPage("teacher", "secret.html"), false);
  assert.equal(canViewPage("admin", "secret.html"), true);
  assert.equal(canViewPage("guest", "assignments.html"), false);
});

test("every sidebar page in the project has a policy entry", async () => {
  const { readdir } = await import("node:fs/promises");
  const pages = (await readdir(new URL("../../public/", import.meta.url)))
    .filter((f) => f.endsWith(".html") && !["login.html", "forbidden.html"].includes(f));
  for (const page of pages) {
    assert.ok(PAGE_POLICY[page], `${page} has no role policy`);
  }
});

import { navTargetFor, NAV_REDIRECTS } from "../../src/client/nav-policy.js";

test("students' Assessments link leads to their own list page; other roles are unchanged", () => {
  assert.equal(navTargetFor("student", "assessments.html"), "my-assessments.html");
  assert.equal(navTargetFor("teacher", "assessments.html"), "assessments.html");
  assert.equal(navTargetFor("admin", "assessments.html"), "assessments.html");
  assert.equal(navTargetFor("student", "attendance.html"), "my-attendance.html");
});

test("the student list page is for students only, and every redirect target has a policy", () => {
  assert.equal(canViewPage("student", "my-assessments.html"), true);
  assert.equal(canViewPage("teacher", "my-assessments.html"), false);
  assert.equal(canViewPage("student", "my-attendance.html"), true);
  assert.equal(canViewPage("teacher", "my-attendance.html"), false);
  for (const target of Object.values(NAV_REDIRECTS.student)) {
    assert.ok(PAGE_POLICY[target], `${target} has no role policy`);
    assert.equal(canViewPage("student", target), true);
  }
});

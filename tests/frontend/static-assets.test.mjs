import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicRoot = path.join(projectRoot, "public");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function publicPath(reference) {
  return path.join(publicRoot, reference.replace(/^\/+/, "").split(/[?#]/)[0]);
}

const publicFiles = await walk(publicRoot);
const htmlFiles = publicFiles.filter(file => file.endsWith(".html"));
const jsFiles = publicFiles.filter(file => file.endsWith(".js"));

test("Every page loads existing local scripts and stylesheets", async () => {
  assert.ok(htmlFiles.length > 0, "Expected at least one HTML page");
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    const references = [
      ...[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match => match[1]),
      ...[...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css)(?:[?#][^"']*)?["']/gi)].map(match => match[1])
    ];
    for (const reference of references.filter(value => value.startsWith("/"))) {
      assert.ok(
        publicFiles.includes(publicPath(reference)),
        `${path.relative(publicRoot, file)} references missing asset ${reference}`
      );
    }
  }
});

test("Page navigation links point to existing local HTML pages", async () => {
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    const links = [...html.matchAll(/\bhref=["'](\/[^"'#?]+\.html)(?:[?#][^"']*)?["']/gi)];
    for (const match of links) {
      assert.ok(
        publicFiles.includes(publicPath(match[1])),
        `${path.relative(publicRoot, file)} links to missing page ${match[1]}`
      );
    }
  }
});

test("JavaScript files pass Node syntax checks", () => {
  assert.ok(jsFiles.length > 0, "Expected frontend JavaScript files");
  for (const file of jsFiles) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(
      result.status,
      0,
      `${path.relative(publicRoot, file)} has a syntax error:\n${result.stderr || result.stdout}`
    );
  }
});

test("HTML pages have unique IDs and linked scripts use existing IDs", async () => {
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]);
    assert.equal(
      new Set(ids).size,
      ids.length,
      `${path.relative(publicRoot, file)} contains duplicate HTML IDs`
    );

    const linkedScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["'](\/[^"']+\.js)(?:[?#][^"']*)?["']/gi)];
    for (const match of linkedScripts) {
      const scriptPath = publicPath(match[1]);
      const script = await readFile(scriptPath, "utf8");
      const referencedIds = [...script.matchAll(/getElementById\(["']([^"']+)["']\)/g)]
        .map(reference => reference[1]);
      for (const id of referencedIds) {
        assert.ok(
          ids.includes(id),
          `${path.relative(publicRoot, file)} loads ${match[1]} which requests missing ID #${id}`
        );
      }
    }
  }
});

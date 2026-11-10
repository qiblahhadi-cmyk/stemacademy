import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, extname } from "node:path";
import { LOCAL_AUTH_EMULATOR_HOST, LOCAL_FIRESTORE_EMULATOR_HOST } from "../../netlify/functions/lib/emulator-host.mjs";

const SKIP_DIRS = new Set(["node_modules", ".git", ".netlify", "bundles"]);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out); else out.push(path);
  }
  return out;
}

test("Netlify build pins a Node major that satisfies package.json engines", () => {
  const toml = readFileSync("netlify.toml", "utf8");
  const match = toml.match(/NODE_VERSION\s*=\s*"(\d+)/);
  assert.ok(match, "netlify.toml must set NODE_VERSION");
  const engineMajor = Number(JSON.parse(readFileSync("package.json", "utf8")).engines.node.match(/(\d+)\./)[1]);
  assert.ok(Number(match[1]) >= engineMajor, "NODE_VERSION must not be older than the engines requirement");
});

test("every server, script and browser source file parses", () => {
  const roots = ["netlify", "scripts", "src", "public/assets/js"];
  const files = roots.flatMap((root) => walk(root)).filter((file) => [".js", ".mjs"].includes(extname(file)));
  assert.ok(files.length > 40, "source discovery found too few files");
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test("repository contains no private keys, .env files or service-account files", () => {
  const files = walk(".");
  assert.equal(files.filter((file) => /(^|\/)\.env($|\.)/.test(file) && !file.endsWith(".env.example")).length, 0);
  assert.equal(files.filter((file) => /service-account.*\.json$/i.test(file)).length, 0);
  for (const file of files.filter((f) => [".js", ".mjs", ".json", ".md", ".toml", ".html", ".yml", ".yaml", ".rules"].includes(extname(f)) && !f.includes("package-lock"))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /-----BEGIN (RSA |EC )?PRIVATE KEY-----\s*[A-Za-z0-9+/=]{20,}/, `${file} appears to contain a private key`);
  }
});

test("Firestore rules deny all direct client access", () => {
  const rules = readFileSync("firestore.rules", "utf8").replace(/\/\/.*$/gm, "");
  const allows = rules.match(/allow\s+[^;]+;/g) ?? [];
  assert.equal(allows.length, 1);
  assert.match(allows[0], /allow\s+read,\s*write:\s*if\s+false;/);
});

test("firebase.json emulator ports match the enforced local endpoints and no production deploy targets are configured", () => {
  const config = JSON.parse(readFileSync("firebase.json", "utf8"));
  assert.equal(`127.0.0.1:${config.emulators.auth.port}`, LOCAL_AUTH_EMULATOR_HOST);
  assert.equal(`127.0.0.1:${config.emulators.firestore.port}`, LOCAL_FIRESTORE_EMULATOR_HOST);
  for (const name of ["auth", "firestore", "ui"]) {
    assert.equal(config.emulators[name].host, "127.0.0.1", `${name} emulator must bind to 127.0.0.1 explicitly`);
  }
  assert.equal(existsSync(".firebaserc"), false, ".firebaserc must not bind this project to a live Firebase project");
});

test("pinned CLI versions are exact in package scripts", () => {
  const wrapper = readFileSync("scripts/run-emulator-command.mjs", "utf8");
  assert.match(wrapper, /firebase-tools@15\.35\.0/);
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.match(scripts.dev, /netlify-cli@27\.16\.3/);
});

test("npm scripts avoid POSIX-only inline environment assignments (Windows PowerShell / cmd compatibility)", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  for (const [name, command] of Object.entries(scripts)) {
    for (const segment of command.split("&&")) {
      assert.doesNotMatch(segment.trim(), /^[A-Z_][A-Z0-9_]*=\S*\s/, `npm script "${name}" uses an inline VAR=value prefix that fails on Windows`);
    }
  }
});

test("emulator client build is routed through the loopback-enforcing wrapper and the --emulator flag", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.match(scripts["build:client:emulator"], /run-emulator-command\.mjs node scripts\/build-client\.mjs --emulator/);
  assert.match(readFileSync("scripts/build-client.mjs", "utf8"), /process\.argv\.includes\("--emulator"\)/);
});

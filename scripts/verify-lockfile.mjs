/**
 * Offline lockfile completeness check. Confirms every dependency declared in
 * package.json has a matching, resolved entry in package-lock.json. It does not
 * contact the registry and it never edits the lockfile: regenerate the lockfile
 * with `npm install` (network required), then re-run this check and `npm ci`.
 * Exit codes: 0 = complete, 1 = gaps found or files unreadable.
 */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const problems = [];
const root = lock.packages?.[""] ?? {};

for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
  for (const [name, range] of Object.entries(pkg[section] ?? {})) {
    if (root[section]?.[name] !== range) problems.push(`${name}: lockfile root does not record ${section} range ${range}`);
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry) { problems.push(`${name}: no node_modules/${name} entry in package-lock.json`); continue; }
    if (!entry.version || !entry.resolved || !entry.integrity) problems.push(`${name}: entry lacks version, resolved URL or integrity hash`);
  }
}
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (path && !entry.link && (!entry.resolved || !entry.integrity)) problems.push(`${path}: missing resolved URL or integrity hash`);
}

if (problems.length) {
  console.error(`package-lock.json is NOT consistent with package.json (${problems.length} problem(s)):`);
  for (const line of problems.slice(0, 40)) console.error(`  - ${line}`);
  console.error("Run `npm install` with registry access to regenerate the lockfile, then `npm ci`.");
  process.exit(1);
}
console.log("package-lock.json is consistent with package.json.");

/**
 * Cross-platform launcher for demo-only Firebase emulator workflows.
 * Avoids POSIX-only inline environment assignments in npm scripts so the
 * documented commands also work from Windows PowerShell / npm.cmd.
 */
import { spawn } from "node:child_process";
import { assertEmulatorEnv, EMULATOR_AUTH_HOST, EMULATOR_FIRESTORE_HOST } from "./emulator-guard.mjs";
import { quoteWindowsArg } from "./shell-quote.mjs";

const [kind, ...args] = process.argv.slice(2);
if (!kind || !["firebase", "node"].includes(kind) || args.length === 0) {
  throw new Error("Usage: node scripts/run-emulator-command.mjs <firebase|node> <command> [...args]");
}

const env = {
  ...process.env,
  FIREBASE_ADMIN_PROJECT_ID: "demo-stem-academy",
  FIREBASE_AUTH_EMULATOR_HOST: EMULATOR_AUTH_HOST,
  FIRESTORE_EMULATOR_HOST: EMULATOR_FIRESTORE_HOST
};
assertEmulatorEnv(env);

let executable;
let childArgs;
let shell = false;
if (kind === "firebase") {
  executable = "npx";
  childArgs = ["--yes", "firebase-tools@15.35.0", ...args];
  // Windows npm shims are .cmd files and require shell dispatch.
  shell = process.platform === "win32";
  // With shell: true Node does not quote arguments, so quote them for cmd.exe.
  if (shell) childArgs = childArgs.map(quoteWindowsArg);
} else {
  executable = process.execPath;
  childArgs = ["--env-file-if-exists=.env", ...args];
}

const child = spawn(executable, childArgs, { env, stdio: "inherit", shell });
child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

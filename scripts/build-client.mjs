/*
 * Bundles the browser code in src/client into public/assets/js/bundles/.
 * Firebase configuration comes from PUBLIC_FIREBASE_* environment variables.
 * Emulator bundles are for local development only and are refused on Netlify.
 */
import { build } from "esbuild";
import { assertEmulatorEnv } from "./emulator-guard.mjs";

// `--emulator` is the cross-platform switch used by `npm run build:client:emulator`;
// the FIREBASE_USE_EMULATOR variable remains supported for POSIX shells.
const useEmulator = process.env.FIREBASE_USE_EMULATOR === "true" || process.argv.includes("--emulator");
const env = process.env;

if (useEmulator && env.NETLIFY) {
  throw new Error("Refusing to build an emulator bundle in a Netlify build.");
}

let webConfig;

if (useEmulator) {
  // Emulator bundles never read PUBLIC_FIREBASE_* values, so a live project in .env
  // cannot leak into a local build.
  assertEmulatorEnv(env);
  webConfig = {
    apiKey: "demo-api-key",
    authDomain: "localhost",
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || "demo-stem-academy",
    appId: "demo-app-id"
  };
} else {
  webConfig = {
    apiKey: env.PUBLIC_FIREBASE_API_KEY,
    authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
    appId: env.PUBLIC_FIREBASE_APP_ID
  };
}

if (!useEmulator) {
  const missing = Object.entries(webConfig).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing public Firebase configuration: ${missing.join(", ")}`);
  }
}

await build({
  entryPoints: {
    login: "src/client/login.js",
    session: "src/client/session-entry.js"
  },
  bundle: true,
  format: "iife",
  target: ["es2020"],
  minify: !useEmulator,
  sourcemap: false,
  outdir: "public/assets/js/bundles",
  define: {
    __FIREBASE_WEB_CONFIG__: JSON.stringify(webConfig),
    __FIREBASE_USE_EMULATOR__: JSON.stringify(useEmulator)
  },
  logLevel: "info"
});

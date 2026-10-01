/**
 * Dual-environment switcher: Local (Docker, offline-capable) <-> Cloud (no Docker).
 *
 * Usage:
 *   npm run env:local   -> activates Local (.env.local points to 127.0.0.1, needs Docker)
 *   npm run env:cloud   -> activates Cloud (.env.local points to supabase.co, needs internet)
 *   npm run env:status  -> shows which environment is currently active
 *
 * How it works:
 * - Your real Cloud keys are stored ONCE in `.env.cloud` (git-ignored, never committed).
 * - Local keys are auto-captured from `npx supabase status` into `.env.localhost`
 *   (also git-ignored), or fall back to the committed `.env.localhost.example`.
 * - Switching just copies the right file to `.env.local` (the file Next.js reads).
 * - Your Cloud keys are NEVER overwritten by a switch.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const ACTIVE = path.join(ROOT, ".env.local");
const CLOUD = path.join(ROOT, ".env.cloud");
const LOCAL_CACHE = path.join(ROOT, ".env.localhost");
const CLOUD_EXAMPLE = path.join(ROOT, ".env.cloud.example");
const LOCAL_EXAMPLE = path.join(ROOT, ".env.localhost.example");

function read(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function detectActive(content) {
  if (!content) return "none (missing .env.local)";
  if (content.includes("127.0.0.1:54321")) return "LOCAL (Docker, offline-capable)";
  if (content.includes("supabase.co")) return "CLOUD (needs internet, no Docker)";
  return "UNKNOWN (custom URL)";
}

function status() {
  const active = read(ACTIVE);
  console.log("Active .env.local -> " + detectActive(active));
  console.log("Has .env.cloud (saved Cloud keys)? " + (read(CLOUD) ? "YES" : "NO - run: npm run env:cloud:init"));
  console.log("Has .env.localhost (saved Local keys)? " + (read(LOCAL_CACHE) ? "YES" : "NO - auto-created on next env:local"));
}

function tryCaptureLocalKeys() {
  // Best-effort: pull live keys from `supabase status` so the user never
  // has to copy-paste local JWTs by hand.
  try {
    const out = execSync("npx supabase status", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 });
    const anon = (out.match(/anon key:\s*(\S+)/i) || [])[1];
    const service = (out.match(/service_role key:\s*(\S+)/i) || [])[1];
    const apiUrl = out.includes("127.0.0.1:54321") ? "http://127.0.0.1:54321" : null;
    if (anon && service && apiUrl) {
      let base = read(LOCAL_CACHE) || read(LOCAL_EXAMPLE) || "";
      base = base.replace(/NEXT_PUBLIC_SUPABASE_URL=.*/g, `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`);
      base = base.replace(/NEXT_PUBLIC_SUPABASE_ANON_KEY=.*/g, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`);
      base = base.replace(/SUPABASE_SERVICE_ROLE_KEY=.*/g, `SUPABASE_SERVICE_ROLE_KEY=${service}`);
      fs.writeFileSync(LOCAL_CACHE, base);
      return true;
    }
  } catch {
    // Supabase CLI not running / Docker off - fall back to cached/example file.
  }
  return false;
}

const cmd = process.argv[2];

if (cmd === "status") {
  status();
} else if (cmd === "local") {
  const captured = tryCaptureLocalKeys();
  const hadCache = !!read(LOCAL_CACHE);
  let src = read(LOCAL_CACHE) || read(LOCAL_EXAMPLE);
  if (!src) {
    console.error("Missing .env.localhost and .env.localhost.example - cannot switch.");
    process.exit(1);
  }
  // Preserve AI keys, timeout, and SMTP settings from the active file.
  const active = read(ACTIVE) || "";
  for (const key of ["GROQ_API_KEY", "GEMINI_API_KEY", "GROQ_MODEL", "GEMINI_MODEL", "NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "OTP_FROM_EMAIL", "OTP_FROM_NAME"]) {
    const m = active.match(new RegExp(`^${key}=.*`, "m"));
    if (m) src = src.replace(new RegExp(`^${key}=.*`, "m"), m[0]);
  }
  fs.writeFileSync(ACTIVE, src);
  console.log("Switched to LOCAL " + (captured ? "(keys auto-captured from supabase status)" : hadCache ? "(from saved .env.localhost keys)" : "(from template - run supabase start + env:local again to capture real keys)"));
  console.log("Kailangan: Docker Desktop BUKAS + `npm run db:start` bago `npm run dev`.");
  console.log("Offline: OO, gagana kahit walang internet (maliban sa AI features).");
} else if (cmd === "cloud") {
  let src = read(CLOUD);
  if (!src) {
    const example = read(CLOUD_EXAMPLE) || "";
    fs.writeFileSync(CLOUD, example);
    console.log("Ginawa ang .env.cloud mula sa template. Buksan mo ito at punan ang 3 Cloud keys, tapos ulitin: npm run env:cloud");
    process.exit(0);
  }
  if (src.includes("your-project-ref") || src.includes("your-cloud-anon-key")) {
    console.log("Hindi pa napupunan ang .env.cloud - buksan mo ito at ilagay ang Cloud URL + anon + service_role keys.");
    process.exit(1);
  }
  fs.writeFileSync(ACTIVE, src);
  console.log("Switched to CLOUD. Hindi mo na kailangan buksan ang Docker.");
  console.log("Kailangan: internet. Test: npm run dev -> http://localhost:3001/login");
} else if (cmd === "cloud:init") {
  if (!read(CLOUD)) {
    fs.writeFileSync(CLOUD, read(CLOUD_EXAMPLE) || "");
    console.log("Ginawa ang .env.cloud. Punan mo ito ng Cloud keys.");
  } else {
    console.log(".env.cloud exists na - hindi ginalaw.");
  }
} else {
  console.log("Usage: node scripts/switch-env.js <status|local|cloud|cloud:init>");
  process.exit(1);
}

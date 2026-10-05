// Logs the demo user in through the web login route handler of a running Leafy web instance.
//   import { loginDemo } from "./demo-session.mjs";
//   const { cookies, storageState } = await loginDemo("http://localhost:3200");
//   const context = await browser.newContext({ storageState });
// Credentials come from LEAFY_DEMO_EMAIL / LEAFY_DEMO_PASSWORD or the git ignored .dev/demo.env.
// The account itself is created by `node scripts/demo-seed.mjs` (needs the preview API on :8100).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { demoCredentials } from "./demo-env.mjs";

// Sessions are cached in the git ignored .dev folder: the login route is rate limited and every
// test worker and screenshot run would otherwise log in again.
const cacheDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".dev");
const MIN_LIFE_SECONDS = 120;

function readCache(origin) {
  const file = resolve(cacheDir, `session-${new URL(origin).port || "80"}.json`);
  if (!existsSync(file)) return null;
  try {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    const soon = Date.now() / 1000 + MIN_LIFE_SECONDS;
    return cached.cookies.every((c) => c.expires === -1 || c.expires > soon) ? cached : null;
  } catch {
    return null;
  }
}

function parseSetCookie(line, hostname) {
  const [pair, ...attrs] = line.split(";").map((part) => part.trim());
  const eq = pair.indexOf("=");
  const cookie = {
    name: pair.slice(0, eq),
    value: pair.slice(eq + 1),
    domain: hostname,
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
    expires: -1,
  };
  for (const attr of attrs) {
    const [key, value = ""] = attr.split("=");
    const lower = key.toLowerCase();
    if (lower === "path") cookie.path = value;
    else if (lower === "httponly") cookie.httpOnly = true;
    else if (lower === "secure") cookie.secure = true;
    else if (lower === "samesite")
      cookie.sameSite = value[0].toUpperCase() + value.slice(1).toLowerCase();
    else if (lower === "max-age") cookie.expires = Math.floor(Date.now() / 1000) + Number(value);
    else if (lower === "expires" && cookie.expires === -1)
      cookie.expires = Math.floor(Date.parse(value) / 1000);
  }
  return cookie;
}

/** Returns { setCookie: string[], cookies: PlaywrightCookie[], storageState }. Throws on failure. */
export async function loginDemo(origin) {
  const cached = readCache(origin);
  if (cached) return cached;
  const { email, password } = demoCredentials();
  const res = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`demo login failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.getSetCookie();
  const hostname = new URL(origin).hostname;
  const cookies = setCookie.map((line) => parseSetCookie(line, hostname));
  const session = { setCookie, cookies, storageState: { cookies, origins: [] } };
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(
    resolve(cacheDir, `session-${new URL(origin).port || "80"}.json`),
    JSON.stringify(session),
  );
  return session;
}

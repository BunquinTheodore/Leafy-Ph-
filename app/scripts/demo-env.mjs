// Reads LEAFY_DEMO_EMAIL / LEAFY_DEMO_PASSWORD from the environment, falling back to the git
// ignored C:\Leafy\.dev\demo.env (a local only throwaway). Nothing secret lives in tracked files.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const devFile = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".dev", "demo.env");

function fromFile() {
  if (!existsSync(devFile)) return {};
  const out = {};
  for (const line of readFileSync(devFile, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !line.trim().startsWith("#")) out[match[1]] = match[2];
  }
  return out;
}

export function demoCredentials() {
  const file = fromFile();
  const email = process.env.LEAFY_DEMO_EMAIL ?? file.LEAFY_DEMO_EMAIL ?? "demo@leafy.test";
  const password = process.env.LEAFY_DEMO_PASSWORD ?? file.LEAFY_DEMO_PASSWORD;
  if (!password) throw new Error("Set LEAFY_DEMO_PASSWORD (or create .dev/demo.env).");
  return { email, password };
}

// Creates the demo account on the preview API and uploads sample leaf photos as scans.
//   node scripts/demo-seed.mjs [apiBase]     (default http://127.0.0.1:8100/api/v1)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { demoCredentials } from "./demo-env.mjs";

const api = process.argv[2] ?? "http://127.0.0.1:8100/api/v1";
const photos = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "api",
  "app",
  "seeds",
  "plant_photos",
);
const { email, password } = demoCredentials();

async function json(path, body) {
  const res = await fetch(`${api}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let session = await json("/auth/register", {
  email,
  password,
  first_name: "Demo",
  last_name: "Leafy",
});
if (session.status >= 400) session = await json("/auth/login", { email, password });
if (session.status >= 400)
  throw new Error(`auth failed ${session.status} ${JSON.stringify(session.body)}`);
const token = session.body?.data?.access_token ?? session.body?.data?.tokens?.access_token;
if (!token) throw new Error(`no token in ${JSON.stringify(session.body).slice(0, 300)}`);

const files = readdirSync(photos)
  .filter((f) => /\.(jpe?g|png)$/i.test(f))
  .slice(0, 10);
for (const name of files) {
  const form = new FormData();
  form.append("image", new Blob([readFileSync(join(photos, name))], { type: "image/jpeg" }), name);
  const res = await fetch(`${api}/scans`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  console.log(name, res.status);
}

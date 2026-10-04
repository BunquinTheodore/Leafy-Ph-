/**
 * Serves the production build the way a real host does, for Lighthouse: `next start` behind a
 * TLS terminating HTTP/2 proxy. `next start` alone speaks HTTP/1.1 only, which caps a page at six
 * parallel connections and makes every lab run look slower than any CDN or platform would serve it.
 *
 *   node scripts/lh-serve.mjs           app on http://127.0.0.1:3000, proxy on https://localhost:3443
 *
 * Environment: NEXT_DIST_DIR (build folder, default .next), LH_APP_PORT, LH_TLS_PORT. The page
 * reads API_INTERNAL_URL and the other settings from the environment, exactly like `next start`.
 * The certificate is generated in memory for this run and trusted only through Chrome's
 * --ignore-certificate-errors flag (see lighthouserc.json). Never use this server in production.
 */
import { spawn } from "node:child_process";
import http from "node:http";
import http2 from "node:http2";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appPort = Number(process.env.LH_APP_PORT ?? 3000);
const tlsPort = Number(process.env.LH_TLS_PORT ?? 3443);
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");

const app = spawn(process.execPath, [nextBin, "start", "-p", String(appPort)], {
  cwd: root,
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
app.on("exit", (code) => process.exit(code ?? 1));

const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade"];

function proxyRequest(request, response) {
  const headers = { ...request.headers, host: `127.0.0.1:${appPort}` };
  for (const name of Object.keys(headers)) if (name.startsWith(":")) delete headers[name];
  const upstream = http.request(
    { host: "127.0.0.1", port: appPort, method: request.method, path: request.url, headers },
    (reply) => {
      const out = { ...reply.headers };
      for (const name of HOP_BY_HOP) delete out[name];
      response.writeHead(reply.statusCode ?? 502, out);
      reply.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.pipe(upstream);
}

async function waitForApp() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const probe = http.get({ host: "127.0.0.1", port: appPort, path: "/robots.txt" }, (reply) => {
        reply.resume();
        resolve(true);
      });
      probe.on("error", () => resolve(false));
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`next start did not answer on :${appPort}`);
}

const pems = await selfsigned.generate([{ name: "commonName", value: "localhost" }], {
  algorithm: "sha256",
  extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }] }],
});
await waitForApp();

const server = http2.createSecureServer({ key: pems.private, cert: pems.cert });
server.on("request", proxyRequest);
server.listen(tlsPort, () => {
  console.log(`Lighthouse server ready: https://localhost:${tlsPort} (HTTP/2 over :${appPort})`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    app.kill();
    process.exit(0);
  });
}

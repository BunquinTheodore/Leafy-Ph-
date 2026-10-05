/**
 * A tiny stand in for the FastAPI service, used only by the member Playwright journeys. It
 * implements the account and session endpoints plus the scans stats and list endpoints, keeps
 * its state in memory and records every call so tests can assert what the web app sent.
 *
 * Control endpoints (never part of the real API):
 *   POST /__mock/reset   body: partial state to start a scenario
 *   GET  /__mock/state   current state and the recorded calls
 */
import { createServer } from "node:http";

const PORT = Number.parseInt(process.env.MOCK_API_PORT ?? "4100", 10);
const PREFIX = "/api/v1";
const MIN_PASSWORD = 10;

const baseUser = () => ({
  id: "11111111-1111-4111-8111-111111111111",
  email: "ada@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
  email_verified: true,
  email_verified_at: "2026-09-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z",
  auth_methods: ["password"],
});

const completedScan = (id, over = {}) => ({
  id,
  status: "completed",
  stage: null,
  failure_code: null,
  verdict: "healthy",
  plant: { slug: "basil", name: "Basil" },
  disease: null,
  confidence: "0.94",
  created_at: "2026-10-01T10:00:00Z",
  image_url: null,
  ...over,
});

const defaultScans = () => [
  completedScan("s1", {
    verdict: "disease",
    plant: { slug: "tomato", name: "Tomato" },
    disease: { slug: "early-blight", name: "Early blight" },
    created_at: "2026-10-03T09:00:00Z",
  }),
  completedScan("s2", { created_at: "2026-10-02T09:00:00Z" }),
  completedScan("s3", {
    verdict: "disease",
    plant: { slug: "tomato", name: "Tomato" },
    disease: { slug: "early-blight", name: "Early blight" },
    created_at: "2026-10-01T09:00:00Z",
  }),
  completedScan("s4", {
    verdict: "disease",
    plant: { slug: "apple", name: "Apple" },
    disease: { slug: "leaf-scorch", name: "Leaf scorch" },
    created_at: "2026-09-28T09:00:00Z",
  }),
  completedScan("s5", { verdict: "unknown", plant: null, created_at: "2026-09-20T09:00:00Z" }),
];

const freshState = () => ({
  user: baseUser(),
  password: "correct-horse-1",
  /** Google only accounts have no password hash. */
  hasPassword: true,
  scans: defaultScans(),
  /** A scan that flips from processing to completed after this many list calls (null: never). */
  completeAfterListCalls: null,
  listCalls: 0,
  reauthRequired: false,
  deleted: false,
  statsFail: false,
  calls: [],
});

let state = freshState();

const envelope = (data) => ({ success: true, data, error: null });
const failure = (code, message, details = null) => ({
  success: false,
  data: null,
  error: { code, message, details, request_id: "req-mock" },
});

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stats() {
  const done = state.scans.filter((scan) => scan.status === "completed");
  const counts = { healthy: 0, disease: 0, unknown: 0 };
  const diseases = new Map();
  for (const scan of done) {
    if (scan.verdict && scan.verdict in counts) counts[scan.verdict] += 1;
    if (scan.verdict === "disease" && scan.disease) {
      const key = `${scan.plant?.name}|${scan.disease.name}`;
      const row = diseases.get(key) ?? {
        plant_slug: scan.plant?.slug ?? "unknown",
        plant_name: scan.plant?.name ?? "Unknown plant",
        disease_slug: scan.disease.slug ?? "unknown",
        disease_name: scan.disease.name,
        display_name: scan.disease.display_name ?? scan.disease.name,
        count: 0,
      };
      row.count += 1;
      diseases.set(key, row);
    }
  }
  return {
    total: done.length,
    last_30_days: done.length,
    by_verdict: counts,
    top_diseases: [...diseases.values()].sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

function listScans(limit) {
  state.listCalls += 1;
  if (state.completeAfterListCalls !== null && state.listCalls >= state.completeAfterListCalls) {
    state.scans = state.scans.map((scan) =>
      scan.status === "processing"
        ? { ...scan, status: "completed", stage: null, verdict: "healthy" }
        : scan,
    );
  }
  return { items: state.scans.slice(0, limit), next_cursor: null };
}

function userOut() {
  return { ...state.user, auth_methods: state.hasPassword ? state.user.auth_methods : ["google"] };
}

function changePassword(body) {
  const next = typeof body?.new_password === "string" ? body.new_password : "";
  if (state.hasPassword && body?.current_password !== state.password) {
    return [403, failure("password_incorrect", "The password is not correct.")];
  }
  if (next.length < MIN_PASSWORD) {
    return [
      422,
      failure("validation_error", "Some details are not valid.", [
        { field: "new_password", type: "too_short" },
      ]),
    ];
  }
  state.password = next;
  if (!state.hasPassword) {
    state.hasPassword = true;
    state.user.auth_methods = [...new Set([...state.user.auth_methods, "password"])];
  }
  return [200, envelope({ changed: true, ...replacementSession() })];
}

/** The real API revokes every older session and answers with a fresh one. */
function replacementSession() {
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 900;
  return {
    access_token: `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: state.user.id, exp })}.sig`,
    refresh_token: "rt-after-password-change-padding-padding",
    expires_in: 900,
    refresh_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  };
}

function deleteAccount(body) {
  if (state.hasPassword) {
    if (body?.password !== state.password) {
      return [403, failure("password_incorrect", "The password is not correct.")];
    }
  } else {
    if (body?.confirmation !== "DELETE") {
      return [
        422,
        failure("validation_error", "Some details are not valid.", [
          { field: "confirmation", type: "must_be_DELETE" },
        ]),
      ];
    }
    if (state.reauthRequired) {
      return [403, failure("reauth_required", "Please sign in again to confirm this change.")];
    }
  }
  state.deleted = true;
  return [200, envelope({ deleted: true })];
}

async function route(req, res) {
  const url = new URL(req.url ?? "/", "http://mock");
  const path = url.pathname;
  const body = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method ?? "")
    ? await readBody(req)
    : null;

  if (path === "/__mock/reset") {
    state = { ...freshState(), ...(body ?? {}) };
    if (body?.user) state.user = { ...baseUser(), ...body.user };
    return send(res, 200, { ok: true });
  }
  if (path === "/__mock/state") return send(res, 200, state);
  if (!path.startsWith(PREFIX)) return send(res, 404, failure("not_found", "Not found."));

  const api = path.slice(PREFIX.length);
  state.calls.push({ method: req.method, path: api, body });
  const authed = Boolean(req.headers.authorization) && !state.deleted;

  if (api === "/auth/logout" && req.method === "POST")
    return send(res, 200, envelope({ ok: true }));
  if (api === "/auth/refresh" && req.method === "POST") {
    return send(
      res,
      401,
      failure("refresh_invalid", "Your session is not valid. Please sign in again."),
    );
  }
  if (!authed) return send(res, 401, failure("not_authenticated", "Please sign in to continue."));

  if (api === "/users/me" && req.method === "GET") return send(res, 200, envelope(userOut()));
  if (api === "/users/me" && req.method === "PATCH") {
    const first = typeof body?.first_name === "string" ? body.first_name : undefined;
    if (first !== undefined && first.length === 0) {
      return send(
        res,
        422,
        failure("validation_error", "Some details are not valid.", [
          { field: "first_name", type: "string_too_short" },
        ]),
      );
    }
    state.user = {
      ...state.user,
      ...(first !== undefined ? { first_name: first } : {}),
      ...(typeof body?.last_name === "string" ? { last_name: body.last_name } : {}),
    };
    return send(res, 200, envelope(userOut()));
  }
  if (api === "/users/me/password" && req.method === "POST") {
    const [status, payload] = changePassword(body);
    return send(res, status, payload);
  }
  if (api === "/users/me" && req.method === "DELETE") {
    const [status, payload] = deleteAccount(body);
    return send(res, status, payload);
  }
  if (api === "/scans/stats" && req.method === "GET") {
    if (state.statsFail)
      return send(res, 500, failure("internal_error", "Something went wrong on our side."));
    return send(res, 200, envelope(stats()));
  }
  if (api === "/scans" && req.method === "GET") {
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10)),
    );
    return send(res, 200, envelope(listScans(limit)));
  }
  return send(res, 404, failure("not_found", "We could not find what you asked for."));
}

createServer((req, res) => {
  route(req, res).catch((error) => {
    send(res, 500, failure("internal_error", String(error?.message ?? "error")));
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`member mock api on ${PORT}`);
});

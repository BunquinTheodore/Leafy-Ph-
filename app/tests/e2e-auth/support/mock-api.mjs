/**
 * Tiny stand in for the Leafy REST API, only for browser tests of the auth screens.
 * Same envelope and error codes as api/openapi.json. Run: node mock-api.mjs (PORT, default 4147).
 *
 * Magic inputs:
 *   taken@example.com      register answers 409 email_taken
 *   limited@example.com    register and login answer 429 rate_limited (Retry-After: 3)
 *   password: "password123456"  register answers 422 validation_error on "password"
 * Test helpers (not part of the real API):
 *   POST /__test/token {type: "verify"|"reset", state?: "valid"|"expired"} -> {token}
 *   GET  /__test/calls -> every request seen, newest last
 *   POST /__test/reset -> forget users, tokens and calls
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4147);
const COMMON_PASSWORD = "password123456";

const state = { users: new Map(), tokens: new Map(), calls: [] };

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (sub) =>
  `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, exp: Math.floor(Date.now() / 1000) + 900 })}.sig`;

const ok = (data, status = 200) => ({ status, body: { success: true, data, error: null } });
const fail = (status, code, extra = {}) => ({
  status,
  headers: extra.headers,
  body: {
    success: false,
    data: null,
    error: { code, message: code, details: extra.details ?? null, request_id: "req-mock" },
  },
});

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  first_name: user.first_name,
  last_name: user.last_name,
  email_verified: user.verified,
  email_verified_at: user.verified ? new Date().toISOString() : null,
  created_at: new Date().toISOString(),
  auth_methods: user.password ? ["password"] : ["google"],
});

const session = (user, extra = {}) => ({
  access_token: jwt(user.id),
  refresh_token: `rt-${user.id}-${Math.random().toString(36).slice(2)}-padding-padding`,
  token_type: "bearer",
  expires_in: 900,
  refresh_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  user: publicUser(user),
  ...extra,
});

function userFromBearer(headers) {
  const token = String(headers.authorization ?? "").replace(/^Bearer /, "");
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    return [...state.users.values()].find((candidate) => candidate.id === payload.sub) ?? null;
  } catch {
    return null;
  }
}

const rateLimited = () => fail(429, "rate_limited", { headers: { "retry-after": "3" } });

function createUser({ email, password, first_name, last_name, verified = false }) {
  const user = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    password,
    first_name,
    last_name: last_name ?? "",
    verified,
  };
  state.users.set(user.email, user);
  return user;
}

const handlers = {
  "POST /api/v1/auth/register": ({ body }) => {
    const email = String(body.email ?? "").toLowerCase();
    if (email === "limited@example.com") return rateLimited();
    if (email === "taken@example.com" || state.users.has(email)) return fail(409, "email_taken");
    if (body.password === COMMON_PASSWORD)
      return fail(422, "validation_error", { details: [{ field: "password", type: "common" }] });
    const user = createUser(body);
    return ok(session(user), 201);
  },
  "POST /api/v1/auth/login": ({ body }) => {
    const email = String(body.email ?? "").toLowerCase();
    if (email === "limited@example.com") return rateLimited();
    const user = state.users.get(email);
    if (!user || user.password !== body.password) return fail(401, "invalid_credentials");
    return ok(session(user));
  },
  "POST /api/v1/auth/forgot-password": () => ok({ sent: true }),
  "POST /api/v1/auth/reset-password": ({ body }) => {
    const entry = state.tokens.get(body.token);
    if (!entry || entry.type !== "reset" || entry.used || entry.state === "expired")
      return fail(400, "token_invalid_or_expired");
    entry.used = true;
    return ok({ reset: true });
  },
  "POST /api/v1/auth/verify-email": ({ body }) => {
    const entry = state.tokens.get(body.token);
    if (!entry || entry.type !== "verify" || entry.used || entry.state === "expired")
      return fail(400, "token_invalid_or_expired");
    entry.used = true;
    return ok({ verified: true });
  },
  "POST /api/v1/auth/resend-verification": ({ headers }) =>
    headers.authorization ? ok({ sent: true }) : fail(401, "not_authenticated"),
  "POST /api/v1/auth/refresh": ({ body }) => {
    const id = /^rt-([0-9a-f-]{36})-/.exec(String(body.refresh_token ?? ""))?.[1];
    const user = [...state.users.values()].find((candidate) => candidate.id === id);
    if (!user) return fail(401, "refresh_invalid");
    return ok({
      access_token: jwt(user.id),
      refresh_token: null,
      token_type: "bearer",
      expires_in: 900,
      refresh_expires_at: null,
    });
  },
  "POST /api/v1/auth/logout": () => ok({ ok: true }),
  // The API's mock account picker: approves the identity and redirects back with a one time code.
  "GET /api/v1/mock-google/authorize": ({ query }) => {
    const target = query.get("redirect_uri");
    const state = query.get("state");
    if (!target || !state) return fail(400, "invalid_state");
    const back = new URL(target);
    back.searchParams.set("code", "mock-google-code");
    back.searchParams.set("state", state);
    return { status: 302, headers: { location: back.toString() }, body: {} };
  },
  "POST /api/v1/auth/google": ({ body }) => {
    if (!body.code) return fail(400, "google_auth_failed");
    const email = "google.user@example.com";
    const existing = state.users.get(email);
    const user =
      existing ??
      createUser({ email, password: null, first_name: "Gale", last_name: "Green", verified: true });
    return ok(session(user, { is_new_user: !existing, linked_existing_account: false }));
  },
  "GET /api/v1/users/me": ({ headers }) => {
    const user = userFromBearer(headers);
    return user ? ok(publicUser(user)) : fail(401, "not_authenticated");
  },
  "GET /api/v1/scans": () => ok({ items: [], next_cursor: null }),
  "GET /api/v1/scans/stats": () =>
    ok({ total: 0, last_30_days: 0, healthy: 0, diseased: 0, unknown: 0, top_diseases: [] }),
  "GET /api/v1/plants": () => ok({ items: [{ slug: "tomato" }, { slug: "apple" }] }),
  "GET /api/v1/diseases": () => ok({ items: [{ slug: "early-blight", plant_slug: "tomato" }] }),
  "POST /__test/token": ({ body }) => {
    const token = `tok-${crypto.randomUUID()}`;
    state.tokens.set(token, {
      type: body.type === "verify" ? "verify" : "reset",
      state: body.state === "expired" ? "expired" : "valid",
      used: false,
    });
    return { status: 200, body: { token } };
  },
  "GET /__test/calls": () => ({ status: 200, body: state.calls }),
  "POST /__test/reset": () => {
    state.users.clear();
    state.tokens.clear();
    state.calls.length = 0;
    return { status: 200, body: { ok: true } };
  },
};

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  const key = `${request.method} ${url.pathname}`;
  const body = await readBody(request);
  if (!url.pathname.startsWith("/__test/"))
    state.calls.push({ key, body, authorization: request.headers.authorization ?? null });
  const handler = handlers[key];
  const result = handler
    ? handler({ body, headers: request.headers, query: url.searchParams })
    : fail(404, "not_found");
  response.writeHead(result.status, {
    "content-type": "application/json",
    ...(result.headers ?? {}),
  });
  response.end(JSON.stringify(result.body));
}).listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`mock api listening on ${PORT}\n`);
});

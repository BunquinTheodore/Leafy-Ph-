/**
 * A tiny stand in for the FastAPI service, used only by the scan Playwright journeys. It
 * implements the scans API (create, get, list with filters and cursor, retry, delete, feedback),
 * the catalog lists the feedback picker needs and the account bits the member shell reads.
 *
 * A scan moves through validating, analyzing and saving on a timer, then ends as a disease,
 * healthy or unknown result, or fails. Everything is in memory and every call is recorded.
 *
 * Control endpoints (never part of the real API):
 *   POST /__mock/reset   body: partial state to start a scenario
 *   GET  /__mock/state   current state and the recorded calls
 *   GET  /__img/<name>   a sample photo (sent with CORS headers, like object storage)
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number.parseInt(process.env.MOCK_API_PORT ?? "4200", 10);
const PREFIX = "/api/v1";
const HERE = dirname(fileURLToPath(import.meta.url));
const PHOTO_DIR = join(HERE, "..", "..", "..", "api", "app", "seeds", "plant_photos");
const MAX_UPLOAD = 8 * 1024 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const iso = (ms) => new Date(ms).toISOString();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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

const PLANTS = [
  { slug: "tomato", name: "Tomato" },
  { slug: "basil", name: "Basil" },
  { slug: "apple", name: "Apple" },
  { slug: "grape", name: "Grape" },
];
const DISEASES = [
  {
    slug: "early-blight",
    plant_slug: "tomato",
    plant_name: "Tomato",
    name: "Early blight",
    display_name: "Early blight",
  },
  {
    slug: "late-blight",
    plant_slug: "tomato",
    plant_name: "Tomato",
    name: "Late blight",
    display_name: "Late blight",
  },
  {
    slug: "apple-scab",
    plant_slug: "apple",
    plant_name: "Apple",
    name: "Apple scab",
    display_name: "Apple scab",
  },
];

const DETAIL = (withImages, imageUrl) => ({
  slug: "tomato-yellow-leaf-curl-virus",
  name: "Tomato Yellow Leaf Curl Virus",
  display_name: "Yellow Leaf Curl Virus",
  plant: { slug: "tomato", name: "Tomato" },
  cause: "A fungus that survives on plant debris and spreads in warm, humid weather.",
  pathogen_type: "fungal",
  pathogen_name: "Begomovirus",
  severity: "Moderate",
  symptoms: [
    "Dark brown spots with rings on older leaves.",
    "Yellow areas around the spots.",
    "Spots grow and join together.",
    "Leaves dry out and drop.",
    "Dark sunken marks on stems.",
    "Fruit shows leathery dark patches near the stem.",
    "Plants lose vigor in warm wet weather.",
  ],
  treatments: [
    "Remove affected leaves and throw them away.",
    "Avoid wetting the leaves when you water.",
    "Mulch the soil to stop splashes.",
    "Space plants for good airflow.",
    "Use a fungicide made for tomatoes if spread continues.",
    "Rotate crops each season.",
    "Clear plant debris at the end of the season.",
    "Choose resistant varieties next year.",
  ],
  preventions: ["Water at the base.", "Rotate crops.", "Clean tools after use."],
  affected_species: ["Potato", "Eggplant"],
  images: withImages ? [{ url: imageUrl, alt_text: "Yellow leaf curl on a tomato leaf" }] : [],
});

const OUTCOMES = {
  disease: {
    verdict: "disease",
    plant: { slug: "tomato", name: "Tomato" },
    disease: {
      slug: "tomato-yellow-leaf-curl-virus",
      name: "Tomato Yellow Leaf Curl Virus",
      display_name: "Yellow Leaf Curl Virus",
      severity: "Moderate",
    },
    confidence: "0.91",
  },
  healthy: {
    verdict: "healthy",
    plant: { slug: "basil", name: "Basil" },
    disease: null,
    confidence: "0.97",
  },
  unknown: { verdict: "unknown", plant: null, disease: null, confidence: null },
};

const freshState = () => ({
  user: baseUser(),
  scans: [],
  nextId: 100,
  /** Timings for a new scan, in milliseconds. */
  timing: { validatingMs: 900, analyzingMs: 1800, savingMs: 700 },
  /** What the next created or retried scan turns into. */
  outcome: "disease",
  retryOutcome: "disease",
  /** Respond to POST /scans with this error instead: { status, code, message, retryAfter }. */
  createError: null,
  /** Pause between request chunks while receiving an upload, to make progress visible. */
  uploadChunkDelayMs: 0,
  withImages: false,
  /** First issued image link is already expired (403); the next one works. */
  expireFirstImage: false,
  tokenCounter: 0,
  minValidToken: 0,
  listFail: false,
  deleteFail: false,
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

async function readJson(req) {
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

/** Consumes an upload, optionally slowly, and returns how many bytes arrived. */
async function drain(req) {
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (state.uploadChunkDelayMs > 0) await sleep(state.uploadChunkDelayMs);
  }
  return size;
}

function imageLink() {
  state.tokenCounter += 1;
  const token = state.tokenCounter;
  return { url: `http://127.0.0.1:${PORT}/__img/apple.jpg?t=${token}`, token };
}

function currentView(scan) {
  const { plan } = scan;
  if (!plan)
    return {
      status: scan.status,
      stage: null,
      failure_code: scan.failure_code ?? null,
      ...scan.result,
    };
  const t = Date.now() - plan.startedAt;
  const { validatingMs, analyzingMs, savingMs } = plan.timing;
  if (t < validatingMs)
    return {
      status: "processing",
      stage: "validating",
      failure_code: null,
      verdict: null,
      plant: null,
      disease: null,
      confidence: null,
    };
  if (t < validatingMs + analyzingMs)
    return {
      status: "processing",
      stage: "analyzing",
      failure_code: null,
      verdict: null,
      plant: null,
      disease: null,
      confidence: null,
    };
  if (t < validatingMs + analyzingMs + savingMs)
    return {
      status: "processing",
      stage: "saving",
      failure_code: null,
      verdict: null,
      plant: null,
      disease: null,
      confidence: null,
    };
  if (plan.outcome === "fail_ml")
    return {
      status: "failed",
      stage: null,
      failure_code: "ml_unavailable",
      verdict: null,
      plant: null,
      disease: null,
      confidence: null,
    };
  if (plan.outcome === "fail_pred")
    return {
      status: "failed",
      stage: null,
      failure_code: "prediction_failed",
      verdict: null,
      plant: null,
      disease: null,
      confidence: null,
    };
  return { status: "completed", stage: null, failure_code: null, ...OUTCOMES[plan.outcome] };
}

function summary(scan) {
  const { url } = imageLink();
  const view = currentView(scan);
  return {
    id: scan.id,
    ...view,
    image_url: url,
    image_expires_at: iso(Date.now() + 600_000),
    created_at: iso(scan.createdAt),
    updated_at: iso(Date.now()),
  };
}

function detail(scan) {
  const base = summary(scan);
  const withDetail = base.status === "completed" && base.verdict === "disease";
  return {
    ...base,
    disease_detail: withDetail ? DETAIL(state.withImages, base.image_url) : null,
    feedback: scan.feedback ?? null,
  };
}

function seedScan(index, over) {
  return {
    id: uuid(index),
    createdAt: Date.parse("2026-10-03T12:00:00Z") - index * 3_600_000,
    plan: null,
    status: "completed",
    result: OUTCOMES.healthy,
    feedback: null,
    ...over,
  };
}

const NO_RESULT = { verdict: null, plant: null, disease: null, confidence: null };

/** Seeds finished scans. `kinds` cycles through disease, healthy, unknown, fail_ml or fail_pred. */
function makeSeeded(count, kinds = ["disease", "healthy", "unknown"]) {
  return Array.from({ length: count }, (_, i) => {
    const kind = kinds[i % kinds.length];
    if (kind === "fail_ml" || kind === "fail_pred") {
      return seedScan(i + 1, {
        status: "failed",
        failure_code: kind === "fail_ml" ? "ml_unavailable" : "prediction_failed",
        result: NO_RESULT,
      });
    }
    return seedScan(i + 1, { result: OUTCOMES[kind] });
  });
}

function createScan() {
  state.nextId += 1;
  const scan = {
    id: uuid(state.nextId),
    createdAt: Date.now(),
    plan: { startedAt: Date.now(), timing: state.timing, outcome: state.outcome },
    feedback: null,
  };
  state.scans = [scan, ...state.scans];
  return scan;
}

function encodeCursor(offset) {
  return Buffer.from(`o:${offset}`).toString("base64url");
}

function decodeCursor(raw) {
  if (!raw) return 0;
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const match = /^o:(\d+)$/.exec(text);
  return match ? Number(match[1]) : null;
}

function listScans(url) {
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10)),
  );
  const offset = decodeCursor(url.searchParams.get("cursor"));
  if (offset === null) return [422, failure("invalid_cursor", "That page link is not valid.")];
  const plant = url.searchParams.get("plant");
  const verdict = url.searchParams.get("verdict");
  const status = url.searchParams.get("status");
  const rows = state.scans
    .map((scan) => ({ scan, view: currentView(scan) }))
    .filter(({ view }) => !plant || view.plant?.slug === plant)
    .filter(({ view }) => !verdict || view.verdict === verdict)
    .filter(({ view }) => !status || view.status === status);
  const page = rows.slice(offset, offset + limit).map(({ scan }) => summary(scan));
  const next = offset + limit < rows.length ? encodeCursor(offset + limit) : null;
  return [200, envelope({ items: page, next_cursor: next })];
}

function findScan(id) {
  return state.scans.find((scan) => scan.id === id) ?? null;
}

async function createRoute(req, res) {
  const size = await drain(req);
  if (state.createError) {
    const { status, code, message, retryAfter } = state.createError;
    const headers = retryAfter ? { "retry-after": String(retryAfter) } : {};
    return send(res, status, failure(code, message), headers);
  }
  if (size > MAX_UPLOAD) return send(res, 413, failure("payload_too_large", "Too large."));
  const scan = createScan();
  return send(res, 202, envelope({ id: scan.id, status: "processing", stage: "validating" }));
}

async function scanRoute(api, req, res, body) {
  const match = /^\/scans\/([^/]+)(\/retry|\/feedback)?$/.exec(api);
  if (!match) return false;
  const [, id, suffix] = match;
  const scan = findScan(id);
  if (!scan) {
    send(res, 404, failure("not_found", "We could not find that scan."));
    return true;
  }
  if (!suffix && req.method === "GET") {
    send(res, 200, envelope(detail(scan)));
    return true;
  }
  if (!suffix && req.method === "DELETE") {
    if (state.deleteFail) {
      send(res, 500, failure("internal_error", "Something went wrong on our side."));
      return true;
    }
    state.scans = state.scans.filter((item) => item.id !== id);
    send(res, 200, envelope({ deleted: true }));
    return true;
  }
  if (suffix === "/retry" && req.method === "POST") {
    if (currentView(scan).status !== "failed") {
      send(res, 409, failure("scan_not_failed", "Only a failed scan can be retried."));
      return true;
    }
    scan.plan = { startedAt: Date.now(), timing: state.timing, outcome: state.retryOutcome };
    send(res, 202, envelope({ id, status: "processing", stage: "analyzing" }));
    return true;
  }
  if (suffix === "/feedback" && req.method === "PUT") {
    if (currentView(scan).status !== "completed") {
      send(res, 409, failure("scan_not_completed", "Wait for the scan to finish."));
      return true;
    }
    const isCorrect = body?.is_correct === true;
    scan.feedback = {
      is_correct: isCorrect,
      correct_plant: isCorrect ? null : (body?.correct_plant ?? null),
      correct_disease: isCorrect ? null : (body?.correct_disease ?? null),
      comment: isCorrect ? null : (body?.comment ?? null),
      updated_at: iso(Date.now()),
    };
    send(res, 200, envelope(scan.feedback));
    return true;
  }
  if (suffix === "/feedback" && req.method === "DELETE") {
    scan.feedback = null;
    send(res, 200, envelope({ deleted: true }));
    return true;
  }
  return false;
}

function serveImage(url, res) {
  const token = Number.parseInt(url.searchParams.get("t") ?? "0", 10);
  const cors = { "access-control-allow-origin": "*" };
  if (token < state.minValidToken) {
    res.writeHead(403, cors);
    res.end("expired");
    return;
  }
  try {
    const bytes = readFileSync(join(PHOTO_DIR, "apple.jpg"));
    res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "no-store", ...cors });
    res.end(bytes);
  } catch {
    res.writeHead(404, cors);
    res.end("missing");
  }
}

async function route(req, res) {
  const url = new URL(req.url ?? "/", "http://mock");
  const path = url.pathname;

  if (path.startsWith("/__img/")) return serveImage(url, res);
  if (path === "/__mock/reset") {
    const body = await readJson(req);
    state = { ...freshState(), ...(body ?? {}) };
    state.user = { ...baseUser(), ...(body?.user ?? {}) };
    state.timing = { ...freshState().timing, ...(body?.timing ?? {}) };
    if (typeof body?.seed === "number") state.scans = makeSeeded(body.seed, body.seedKinds);
    if (state.expireFirstImage) state.minValidToken = 2;
    return send(res, 200, { ok: true });
  }
  if (path === "/__mock/state") return send(res, 200, state);
  if (!path.startsWith(PREFIX)) return send(res, 404, failure("not_found", "Not found."));

  const api = path.slice(PREFIX.length);
  const hasBody = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method ?? "");
  const isUpload = api === "/scans" && req.method === "POST";
  const body = hasBody && !isUpload ? await readJson(req) : null;
  state.calls.push({ method: req.method, path: api, body, query: url.search });

  if (api === "/plants" && req.method === "GET") return send(res, 200, envelope({ items: PLANTS }));
  if (api === "/diseases" && req.method === "GET")
    return send(res, 200, envelope({ items: DISEASES }));
  if (api === "/auth/logout" && req.method === "POST")
    return send(res, 200, envelope({ ok: true }));
  if (api === "/auth/refresh" && req.method === "POST") {
    return send(
      res,
      401,
      failure("refresh_invalid", "Your session is not valid. Please sign in again."),
    );
  }
  if (!req.headers.authorization) {
    if (isUpload) await drain(req);
    return send(res, 401, failure("not_authenticated", "Please sign in to continue."));
  }
  if (api === "/users/me" && req.method === "GET") return send(res, 200, envelope(state.user));
  if (isUpload) return createRoute(req, res);
  if (api === "/scans" && req.method === "GET") {
    if (state.listFail)
      return send(res, 500, failure("internal_error", "Something went wrong on our side."));
    const [status, payload] = listScans(url);
    return send(res, status, payload);
  }
  if (await scanRoute(api, req, res, body)) return undefined;
  return send(res, 404, failure("not_found", "We could not find what you asked for."));
}

createServer((req, res) => {
  route(req, res).catch((error) => {
    send(res, 500, failure("internal_error", String(error?.message ?? "error")));
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`scan mock api on ${PORT}`);
});

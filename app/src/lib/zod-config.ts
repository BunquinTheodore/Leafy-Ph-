import { config } from "zod/v4/core";

/**
 * Zod probes `Function("")` to decide whether it may compile fast validators. Our CSP forbids
 * eval, so the probe is reported as a violation on every page that validates a response. Turning
 * the JIT path off skips the probe; the interpreted path is just as correct and fast enough here.
 */
config({ jitless: true });

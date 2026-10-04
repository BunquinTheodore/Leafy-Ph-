"use client";

import { useEffect, useState } from "react";
import { readEffectsOff } from "../interaction/hooks";

/** Quiet time after the page has loaded before a decorative scene is allowed to start. */
export const DEFERRED_MOUNT_DELAY_MS = 2500;
/** After the quiet time the scene waits for an idle moment, but never longer than this. */
export const DEFERRED_MOUNT_IDLE_TIMEOUT_MS = 1500;

/** Data Saver on, or a phone with 2 GB of memory or less, or 2 cores or less: the poster is enough. */
export function lowPowerDevice(): boolean {
  const nav = window.navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  if (nav.connection?.saveData === true) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return true;
  return typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 2;
}

/**
 * True when the decorative 3D scenes must not start: the head script marked effects off for
 * Lighthouse, PageSpeed Insights, webdriver and ?nosplash runs (see head-script.ts), so scores and
 * tests measure the page itself, or the device is low power and keeps the static poster. `?webgl`
 * overrides both for the browser tests that check the scenes.
 */
export function scenesSuppressed(search: string = window.location.search): boolean {
  if (/[?&]webgl(?:&|$)/.test(search)) return false;
  return readEffectsOff() || lowPowerDevice();
}

/**
 * Calls `onReady` once, in an idle moment DEFERRED_MOUNT_DELAY_MS after the window load event.
 * The three.js chunks (a few hundred KB) and the shader compile therefore never compete with the
 * content for bandwidth or the main thread while the page loads, and never land on top of the
 * user's first interaction. Returns a cancel function.
 */
export function scheduleDeferredMount(onReady: () => void): () => void {
  let cancelled = false;
  let timer: number | undefined;
  let idle: number | undefined;

  const mountWhenIdle = () => {
    const fire = () => {
      if (!cancelled) onReady();
    };
    if (typeof window.requestIdleCallback === "function") {
      idle = window.requestIdleCallback(fire, { timeout: DEFERRED_MOUNT_IDLE_TIMEOUT_MS });
    } else {
      fire();
    }
  };
  const startTimer = () => {
    window.removeEventListener("load", startTimer);
    timer = window.setTimeout(mountWhenIdle, DEFERRED_MOUNT_DELAY_MS);
  };

  if (document.readyState === "complete") startTimer();
  else window.addEventListener("load", startTimer);

  return () => {
    cancelled = true;
    window.removeEventListener("load", startTimer);
    window.clearTimeout(timer);
    if (idle !== undefined && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idle);
    }
  };
}

/** False on the server, during load and when scenes are suppressed; true once a scene may mount. */
export function useDeferredMount(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (scenesSuppressed()) return;
    return scheduleDeferredMount(() => setReady(true));
  }, []);
  return ready;
}

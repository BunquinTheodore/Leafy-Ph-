"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FINE_POINTER_QUERY } from "../interaction/hooks";
import { SfxGate, soundForTarget, type SoundName } from "./mapping";

const STORAGE_KEY = "leafy-sfx";

interface SfxApi {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  play: (name: SoundName) => void;
}

const NOOP: SfxApi = { enabled: false, setEnabled: () => undefined, play: () => undefined };
const SfxContext = createContext<SfxApi>(NOOP);

export const useSfx = (): SfxApi => useContext(SfxContext);

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeStored(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the choice just lasts for this visit.
  }
}

/** Sound is off for Lighthouse, webdriver and ?nosound so it never affects scores. */
function blockedByEnvironment(): boolean {
  return navigator.webdriver === true || /[?&]nosound\b/.test(window.location.search);
}

type SynthModule = typeof import("./synth");

/**
 * Web Audio SFX. Nothing loads or plays until the first user gesture; the synth chunk is lazy
 * loaded; hover sounds are limited to a real mouse with motion allowed; the tab hidden mutes it.
 */
export function SfxProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(true);
  const enabledRef = useRef(true);
  const contextRef = useRef<AudioContext | null>(null);
  const synthRef = useRef<SynthModule | null>(null);
  const gateRef = useRef(new SfxGate());
  const blockedRef = useRef(false);

  useEffect(() => {
    const stored = readStored();
    enabledRef.current = stored;
    blockedRef.current = blockedByEnvironment();
    setEnabledState(stored);
  }, []);

  const ensureAudio = useCallback(async (): Promise<boolean> => {
    if (blockedRef.current) return false;
    if (!synthRef.current) synthRef.current = await import("./synth");
    if (!contextRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      contextRef.current = new Ctor();
    }
    if (contextRef.current.state === "suspended") await contextRef.current.resume();
    return true;
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabledRef.current || blockedRef.current || document.hidden) return;
      if (!gateRef.current.allow(name, performance.now())) return;
      void ensureAudio().then((ready) => {
        const ctx = contextRef.current;
        if (ready && ctx && synthRef.current) synthRef.current.playSound(ctx, name);
      });
    },
    [ensureAudio],
  );

  const setEnabled = useCallback(
    (value: boolean) => {
      enabledRef.current = value;
      setEnabledState(value);
      writeStored(value);
      if (value) play("toggle");
    },
    [play],
  );

  useEffect(() => {
    const fine = window.matchMedia(FINE_POINTER_QUERY).matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onDown = (event: PointerEvent) => {
      const sound = soundForTarget(
        event.target instanceof Element ? event.target : null,
        "pointerdown",
      );
      if (sound) play(sound);
    };
    const onOver = (event: PointerEvent) => {
      if (!fine || reduced || event.pointerType !== "mouse") return;
      const sound = soundForTarget(
        event.target instanceof Element ? event.target : null,
        "pointerover",
      );
      if (sound) play(sound);
    };
    const onVisibility = () => {
      const ctx = contextRef.current;
      if (!ctx) return;
      if (document.hidden) void ctx.suspend();
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [play]);

  const value = useMemo(() => ({ enabled, setEnabled, play }), [enabled, setEnabled, play]);
  return <SfxContext.Provider value={value}>{children}</SfxContext.Provider>;
}

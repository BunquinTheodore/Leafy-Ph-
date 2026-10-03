"use client";

import { Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { useSfx } from "../sfx/SfxProvider";
import { applyTheme, useTheme } from "./theme";

const iconProps = {
  size: 20,
  strokeWidth: 1.5,
  strokeLinecap: "round",
  "aria-hidden": true,
} as const;

export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon pressable"
      data-sfx="toggle"
      aria-label={`Switch to ${next} theme`}
      onClick={() => applyTheme(next)}
    >
      {theme === "dark" ? <Sun {...iconProps} /> : <Moon {...iconProps} />}
    </button>
  );
}

export function SoundToggle() {
  const { enabled, setEnabled } = useSfx();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const on = mounted ? enabled : true;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon pressable"
      data-sfx="none"
      aria-pressed={on}
      aria-label={on ? "Sound on. Turn sound off" : "Sound off. Turn sound on"}
      onClick={() => setEnabled(!enabled)}
    >
      {on ? <Volume2 {...iconProps} /> : <VolumeX {...iconProps} />}
    </button>
  );
}

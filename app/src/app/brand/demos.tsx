"use client";

import { useState } from "react";
import { useSfx } from "@/components/sfx/SfxProvider";
import type { SoundName } from "@/components/sfx/mapping";
import { Button, Dialog, Input, PasswordStrength, useToast } from "@/components/ui";

/** Live form pieces for the guide: floating label, inline error, password strength. */
export function FormDemo() {
  const [password, setPassword] = useState("fern-leaf-tomato");
  const [email, setEmail] = useState("ada@example");
  return (
    <div className="grid gap-4">
      <Input
        label="Email"
        type="email"
        autoComplete="off"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={
          email.includes("@") && email.includes(".")
            ? undefined
            : "Enter an email like name@example.com."
        }
      />
      <div>
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          revealable
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordStrength password={password} email={email} />
      </div>
    </div>
  );
}

/** Toast and dialog triggers. */
export function OverlayDemo() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => toast({ message: "Scan saved to your history." })}
      >
        Show toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          toast({
            message: "Scan deleted.",
            action: {
              label: "Undo",
              onAction: () => toast({ message: "Scan restored.", tone: "info" }),
            },
          })
        }
      >
        Toast with Undo
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this scan?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              data-sfx="delete"
              magnetic={false}
              onClick={() => setOpen(false)}
            >
              Delete scan
            </Button>
          </>
        }
      >
        <p>
          The photo and its result are removed from your history. You can undo for a few seconds.
        </p>
      </Dialog>
    </div>
  );
}

const SOUNDS: Array<{ name: SoundName; label: string; note: string }> = [
  { name: "click", label: "Click", note: "soft pluck, 100 ms" },
  { name: "hover", label: "Hover", note: "quiet tick, mouse only" },
  { name: "toggle", label: "Toggle", note: "two note step, 160 ms" },
  { name: "panel", label: "Panel", note: "leaf rustle, 220 ms" },
  { name: "success", label: "Success", note: "rising chime, 240 ms" },
  { name: "error", label: "Error", note: "low soft thud, 220 ms" },
  { name: "delete", label: "Delete", note: "muted, 140 ms" },
  { name: "scanStart", label: "Scan start", note: "rising sweep, 500 ms" },
  { name: "scanDone", label: "Scan done", note: "three note chime, 550 ms" },
];

/** Plays each synthesized sound. Respects the header sound toggle. */
export function SoundDemo() {
  const sfx = useSfx();
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {SOUNDS.map((sound) => (
        <li key={sound.name}>
          <button
            type="button"
            data-sfx="none"
            className="btn btn-secondary btn-sm w-full justify-between pressable"
            onClick={() => sfx.play(sound.name)}
          >
            <span>{sound.label}</span>
            <span className="text-xs font-normal text-[var(--text-muted)]">{sound.note}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

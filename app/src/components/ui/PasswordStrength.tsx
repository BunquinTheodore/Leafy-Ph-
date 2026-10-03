import { scorePassword } from "./password-score";

const SEGMENTS = [1, 2, 3, 4] as const;
const TONES = ["", "var(--danger)", "var(--accent)", "var(--brand)", "var(--brand-glow)"] as const;

/** Strength meter with a text label and hint, so it never relies on color alone. */
export function PasswordStrength({
  password,
  email,
  id,
}: {
  password: string;
  email?: string;
  id?: string;
}) {
  const { score, label, hint } = scorePassword(password, email);
  return (
    <div id={id} className="mt-2" aria-live="polite">
      <div
        className="flex gap-1"
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-valuetext={label || "Empty"}
      >
        {SEGMENTS.map((segment) => (
          <span
            key={segment}
            className="h-1 flex-1 rounded-full"
            style={{ background: segment <= score ? TONES[score] : "var(--border)" }}
          />
        ))}
      </div>
      <p className="field__message m-0 mt-1">
        {label ? <strong className="font-medium text-[var(--text)]">{label}. </strong> : null}
        {hint}
      </p>
    </div>
  );
}

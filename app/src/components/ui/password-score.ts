export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export interface PasswordScore {
  /** 0 (empty) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hint: string;
}

const COMMON = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd123",
  "1234567890",
  "12345678910",
  "0123456789",
  "qwertyuiop",
  "qwerty12345",
  "1q2w3e4r5t",
  "iloveyou123",
  "letmein123",
  "welcome123",
  "admin12345",
  "abc1234567",
  "leafy12345",
]);

const letters = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

function classCount(value: string): number {
  return [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
}

const LABELS: Record<number, string> = { 1: "Weak", 2: "Fair", 3: "Good", 4: "Strong" };
const HINTS: Record<number, string> = {
  1: "Add more words or characters.",
  2: "Longer is better. Try a short phrase.",
  3: "Nice. A few more characters make it stronger.",
  4: "Strong password.",
};

/** Client side strength hint. The API enforces the real rules (10 to 128 chars, not the email, not common). */
export function scorePassword(password: string, email = ""): PasswordScore {
  if (password.length === 0)
    return { score: 0, label: "", hint: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { score: 1, label: "Too long", hint: `Use at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      score: 1,
      label: "Too short",
      hint: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (email && password.toLowerCase().includes(email.toLowerCase())) {
    return {
      score: 1,
      label: "Too guessable",
      hint: "Do not use your email address in your password.",
    };
  }
  const lowered = password.toLowerCase();
  if (COMMON.has(lowered) || COMMON.has(letters(password)) || /^(\d)\1+$/.test(password)) {
    return { score: 1, label: "Too common", hint: "Pick something less common." };
  }

  const uniqueRatio = new Set(password).size / password.length;
  let points = 0;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;
  const classes = classCount(password);
  if (classes >= 2) points += 1;
  if (classes >= 3) points += 1;
  if (uniqueRatio < 0.4) points = 0;

  const score = Math.min(4, 1 + points) as 1 | 2 | 3 | 4;
  return { score, label: LABELS[score] as string, hint: HINTS[score] as string };
}

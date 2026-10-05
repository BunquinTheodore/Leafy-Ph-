/**
 * Public Firebase web config. These are identifiers, not secrets, but they still come from the
 * environment. NEXT_PUBLIC values are inlined at build time, so each one is read by its literal
 * `process.env.NAME` below (a dynamic lookup would not be replaced).
 */
export interface FirebaseWebConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId?: string;
  readonly storageBucket?: string;
  readonly messagingSenderId?: string;
}

export type RawFirebaseEnv = Readonly<Record<string, string | undefined>>;

const clean = (value: string | undefined): string => (value ?? "").trim();
const optional = (value: string | undefined): string | undefined => clean(value) || undefined;

/** The config, or null when Google sign in is not set up (an empty API key switches it off). */
export function parseFirebaseConfig(raw: RawFirebaseEnv): FirebaseWebConfig | null {
  const apiKey = clean(raw.NEXT_PUBLIC_FIREBASE_API_KEY);
  const authDomain = clean(raw.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  const projectId = clean(raw.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  if (!apiKey || !authDomain || !projectId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId: optional(raw.NEXT_PUBLIC_FIREBASE_APP_ID),
    storageBucket: optional(raw.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: optional(raw.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  };
}

const publicEnv = (): RawFirebaseEnv => ({
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
});

export const firebaseConfig = (): FirebaseWebConfig | null => parseFirebaseConfig(publicEnv());

/** Build time flag for the fake provider (tests and local development only). */
export const isAuthMock = (): boolean => process.env.NEXT_PUBLIC_AUTH_MOCK === "1";

/** Whether the Google button can do anything at all. */
export const isGoogleSignInAvailable = (): boolean => isAuthMock() || firebaseConfig() !== null;

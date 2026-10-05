import type { ReactNode } from "react";
import { preconnect } from "react-dom";
import { requireUser } from "@/lib/auth/current-user";
import { imgOriginsFrom } from "@/lib/http/img-origins";

/**
 * Member routes. A missing or ended session redirects to sign in (the middleware normally does
 * this first).
 * Scan photos come from the public object storage host, so its connection is opened early.
 */
export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireUser();
  for (const origin of imgOriginsFrom(process.env.S3_PUBLIC_ENDPOINT)) preconnect(origin);
  return <>{children}</>;
}

import type { ReactNode } from "react";
import { preconnect } from "react-dom";
import { VerifyEmailBanner } from "@/components/layout/VerifyEmailBanner";
import { requireUser } from "@/lib/auth/current-user";
import { imgOriginsFrom } from "@/lib/http/img-origins";

/**
 * Member routes. A missing or ended session redirects to sign in (the middleware normally does
 * this first). Members who have not verified their email see a banner with a resend action.
 * Scan photos come from the public object storage host, so its connection is opened early.
 */
export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireUser();
  for (const origin of imgOriginsFrom(process.env.S3_PUBLIC_ENDPOINT)) preconnect(origin);
  return (
    <>
      {user.email_verified ? null : <VerifyEmailBanner />}
      {children}
    </>
  );
}

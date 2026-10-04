import type { Metadata } from "next";
import { AuthCard, AuthIntro, AuthStage } from "@/components/auth/AuthLayout";
import { VerifyEmailPanel } from "@/components/auth/VerifyEmailPanel";
import { enAuth } from "@/lib/i18n/auth.en";
import { pageMetadata } from "@/lib/seo/metadata";

/** The link carries a secret: never send it on in a Referer header, and keep the page out of search. */
export const metadata: Metadata = {
  ...pageMetadata({
    title: "Verify your email",
    description: "Confirm your email address to start scanning leaves with Leafy.",
    path: "/verify-email",
    noindex: true,
  }),
  referrer: "no-referrer",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  const copy = enAuth.verify;
  return (
    <AuthStage>
      <AuthIntro eyebrow={copy.eyebrow} title={copy.title} blurb={enAuth.verify.blurb} />
      <AuthCard>
        <VerifyEmailPanel token={typeof token === "string" && token ? token : null} />
      </AuthCard>
    </AuthStage>
  );
}

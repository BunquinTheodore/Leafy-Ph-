import type { Metadata } from "next";
import { AuthCard, AuthIntro, AuthStage } from "@/components/auth/AuthLayout";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { enAuth } from "@/lib/i18n/auth.en";
import { pageMetadata } from "@/lib/seo/metadata";

/** The link carries a secret: never send it on in a Referer header, and keep the page out of search. */
export const metadata: Metadata = {
  ...pageMetadata({
    title: "Choose a new password",
    description: "Choose a new password for your Leafy account.",
    path: "/reset-password",
    noindex: true,
  }),
  referrer: "no-referrer",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  const copy = enAuth.reset;
  return (
    <AuthStage>
      <AuthIntro eyebrow={copy.eyebrow} title={copy.title} blurb={copy.blurb} />
      <AuthCard>
        <ResetPasswordForm token={typeof token === "string" && token ? token : null} />
      </AuthCard>
    </AuthStage>
  );
}

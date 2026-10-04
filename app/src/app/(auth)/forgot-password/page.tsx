import type { Metadata } from "next";
import { AuthCard, AuthIntro } from "@/components/auth/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { enAuth } from "@/lib/i18n/auth.en";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Reset password",
  description: "Request a link to choose a new Leafy password.",
  path: "/forgot-password",
  noindex: true,
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const copy = enAuth.forgot;
  return (
    <>
      <AuthIntro eyebrow={copy.eyebrow} title={copy.title} blurb={copy.blurb} />
      <AuthCard>
        <ForgotPasswordForm next={next} />
      </AuthCard>
    </>
  );
}

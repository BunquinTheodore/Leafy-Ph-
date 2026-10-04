import type { Metadata } from "next";
import { AuthCard, AuthIntro } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";
import { noteFromParams } from "@/components/auth/messages";
import { enAuth } from "@/lib/i18n/auth.en";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Sign in",
  description: "Sign in to Leafy to scan leaves, see your history and keep your plants healthy.",
  path: "/login",
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const copy = enAuth.login;
  return (
    <>
      <AuthIntro eyebrow={copy.eyebrow} title={copy.title} blurb={copy.blurb} />
      <AuthCard>
        <LoginForm next={next} note={noteFromParams(params)} />
      </AuthCard>
    </>
  );
}

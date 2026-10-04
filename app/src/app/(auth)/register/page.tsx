import type { Metadata } from "next";
import { AuthCard, AuthIntro } from "@/components/auth/AuthLayout";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { enAuth } from "@/lib/i18n/auth.en";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Create account",
  description:
    "Create a free Leafy account to scan leaves and keep a private history of your plants.",
  path: "/register",
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const copy = enAuth.register;
  return (
    <>
      <AuthIntro eyebrow={copy.eyebrow} title={copy.title} blurb={copy.blurb} />
      <AuthCard>
        <RegisterForm next={next} />
      </AuthCard>
    </>
  );
}

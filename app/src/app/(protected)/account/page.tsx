import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AccountPanels } from "@/components/account/AccountPanels";
import { requireUser } from "@/lib/auth/current-user";
import { cookieNames } from "@/lib/auth/cookies";
import { isRecentGoogleSignIn } from "@/lib/auth/recent-google";
import { getEnv } from "@/lib/env";
import { member } from "@/lib/i18n/member-en";
import "@/components/account/account.css";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  const jar = await cookies();
  const recentGoogle = isRecentGoogleSignIn(
    jar.get(cookieNames(getEnv().cookiePrefix).access)?.value,
    Date.now(),
  );
  return (
    <div className="acct-stage stage-fill">
      <header className="acct-stage__head">
        <h1 className="display display-sm acct-stage__title">{member.account.title}</h1>
      </header>
      <div className="acct-stage__panels">
        <AccountPanels
          recentGoogle={recentGoogle}
          user={{
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            auth_methods: user.auth_methods,
          }}
        />
      </div>
    </div>
  );
}

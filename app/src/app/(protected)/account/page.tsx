import type { Metadata } from "next";
import { AccountPanels } from "@/components/account/AccountPanels";
import { LogoMark } from "@/components/brand/Logo";
import { requireUser } from "@/lib/auth/current-user";
import { member } from "@/lib/i18n/member-en";
import "@/components/account/account.css";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="acct-stage stage-fill">
      <div className="acct-stage__mark" aria-hidden="true">
        <LogoMark height={420} />
      </div>
      <header className="acct-stage__head">
        <h1 className="display display-sm">{member.account.title}</h1>
      </header>
      <div className="acct-stage__panels">
        <AccountPanels
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

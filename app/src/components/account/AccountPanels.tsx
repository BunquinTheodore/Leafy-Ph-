"use client";

import { useState } from "react";
import { member } from "@/lib/i18n/member-en";
import { SlidePanels, type Panel } from "../slide-panels/SlidePanels";
import { DangerPanel } from "./DangerPanel";
import { Goodbye } from "./Goodbye";
import { PasswordPanel } from "./PasswordPanel";
import { ProfilePanel } from "./ProfilePanel";
import type { AccountUser } from "./types";
import "./account.css";

const copy = member.account;

/** Account as sideways panels: Profile, Password and Danger zone (deep links #profile and so on). */
export function AccountPanels({ user }: { user: AccountUser }) {
  const [deleted, setDeleted] = useState(false);
  if (deleted) return <Goodbye />;

  const panels: Panel[] = [
    { id: "profile", title: copy.panels.profile, content: <ProfilePanel user={user} /> },
    { id: "password", title: copy.panels.password, content: <PasswordPanel user={user} /> },
    {
      id: "danger",
      title: copy.panels.danger,
      content: <DangerPanel user={user} onDeleted={() => setDeleted(true)} />,
    },
  ];
  return <SlidePanels label={copy.panelsLabel} panels={panels} />;
}

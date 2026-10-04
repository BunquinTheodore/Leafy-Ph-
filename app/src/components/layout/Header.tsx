import { getSessionUser } from "@/lib/auth/current-user";
import { HeaderBar } from "./HeaderBar";
import "./member.css";

/** Shared header (server side): looks up the signed in user once per request. */
export async function Header() {
  const user = await getSessionUser();
  return (
    <HeaderBar
      user={
        user ? { firstName: user.first_name, lastName: user.last_name, email: user.email } : null
      }
    />
  );
}

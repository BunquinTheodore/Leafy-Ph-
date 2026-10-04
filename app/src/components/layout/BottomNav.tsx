import { getSessionUser } from "@/lib/auth/current-user";
import { BottomNavBar } from "./BottomNavBar";

/** Phone navigation for signed in members. Renders nothing for guests. */
export async function BottomNav() {
  const user = await getSessionUser();
  return user ? <BottomNavBar /> : null;
}

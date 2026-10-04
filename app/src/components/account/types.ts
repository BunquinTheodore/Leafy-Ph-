import type { UserOut } from "@/lib/api/types";

/** The slice of the member that the account panels need. */
export type AccountUser = Pick<UserOut, "email" | "first_name" | "last_name" | "auth_methods">;

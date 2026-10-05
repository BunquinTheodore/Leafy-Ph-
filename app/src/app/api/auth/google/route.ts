import type { NextRequest } from "next/server";
import { getGoogleSignIn } from "@/lib/auth/google";

export const dynamic = "force-dynamic";

/** POST only: the browser sends the Firebase ID token it just got from Google. */
export const POST = (request: NextRequest) => getGoogleSignIn().handle(request);

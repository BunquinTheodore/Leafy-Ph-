import type { NextRequest } from "next/server";
import { getGoogleFlow } from "@/lib/auth/google";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) => getGoogleFlow().callback(request);

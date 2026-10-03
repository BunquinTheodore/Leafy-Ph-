import type { NextRequest } from "next/server";
import { getProxy } from "@/lib/http/proxy";

export const dynamic = "force-dynamic";

export const POST = (request: NextRequest) =>
  getProxy().session(request, { apiPath: "/auth/login" });

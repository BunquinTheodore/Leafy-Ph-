import type { NextRequest } from "next/server";
import { getProxy } from "@/lib/http/proxy";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) =>
  getProxy().json(request, { apiPath: "/users/me", auth: "required" });
export const PATCH = (request: NextRequest) =>
  getProxy().json(request, { apiPath: "/users/me", auth: "required" });
export const DELETE = (request: NextRequest) =>
  getProxy().json(request, { apiPath: "/users/me", auth: "required", clearCookiesOnSuccess: true });

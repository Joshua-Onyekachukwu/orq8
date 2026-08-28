import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/constitution", { method: "GET" });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  return proxyApiJson(request, "/v1/constitution", { method: "PATCH", body });
}

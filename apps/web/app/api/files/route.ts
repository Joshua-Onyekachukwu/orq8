import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/files");
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyApiJson(request, "/v1/files", { method: "POST", body });
}

import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../lib/api";

export async function GET(request: NextRequest) {
  return proxyApiJson(request, "/v1/departments");
}

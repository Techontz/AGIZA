import type { NextRequest } from "next/server";

import { startSession } from "../_shared";

export async function POST(req: NextRequest) {
  return startSession(req, "auth/login/");
}

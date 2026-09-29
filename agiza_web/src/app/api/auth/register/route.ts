import type { NextRequest } from "next/server";

import { startSession } from "../_shared";

/** Phone-verified registration (the code comes from POST /api/proxy/auth/request-code). */
export async function POST(req: NextRequest) {
  return startSession(req, "auth/register/");
}

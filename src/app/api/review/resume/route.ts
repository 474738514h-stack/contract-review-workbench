import { connection } from "next/server";

import { FOCUS_OPTIONS } from "@/lib/options";
import { reviewResume } from "@/lib/review-service";

export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => null)) as {
    eventId?: unknown;
    interruptType?: unknown;
    contractType?: unknown;
    stance?: unknown;
    focus?: unknown;
  } | null;
  if (!body || typeof body.eventId !== "string" || typeof body.interruptType !== "number") {
    return Response.json(
      {
        ok: false,
        demo: false,
        error: "无法继续这次审查，请重新提交合同。",
        authUrl: null,
        resume: null,
        result: null,
      },
      { status: 400 },
    );
  }
  const focus = Array.isArray(body.focus)
    ? body.focus.filter((item): item is string => typeof item === "string" && FOCUS_OPTIONS.includes(item as (typeof FOCUS_OPTIONS)[number]))
    : [];
  const result = await reviewResume({
    eventId: body.eventId,
    interruptType: body.interruptType,
    contractType: typeof body.contractType === "string" ? body.contractType : "",
    stance: typeof body.stance === "string" ? body.stance : "",
    focus,
  });
  return Response.json(result);
}

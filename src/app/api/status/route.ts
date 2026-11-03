import { connection } from "next/server";

import { checkCozeConnection, cozeConfigured } from "@/lib/coze";

export async function GET() {
  await connection();
  if (!cozeConfigured()) {
    return Response.json(
      { configured: false, connected: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const connected = await checkCozeConnection();
  return Response.json(
    { configured: true, connected },
    { headers: { "Cache-Control": "no-store" } },
  );
}

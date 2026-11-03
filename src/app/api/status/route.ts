import { connection } from "next/server";

import { checkCozeConnection, cozeConfigured, reviewUsesMock } from "@/lib/coze";

export async function GET() {
  await connection();
  if (reviewUsesMock()) {
    return Response.json(
      { configured: false, connected: false, mock: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!cozeConfigured()) {
    return Response.json(
      { configured: false, connected: false, mock: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const connected = await checkCozeConnection();
  return Response.json(
    { configured: true, connected, mock: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { connection } from "next/server";

import { reviewForm } from "@/lib/review-service";

export async function POST(request: Request) {
  await connection();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      {
        ok: false,
        demo: false,
        error: "无法读取上传内容，请确认文件不超过 10MB。",
        authUrl: null,
        resume: null,
        result: null,
      },
      { status: 400 },
    );
  }
  const result = await reviewForm(form);
  const status = result.result || result.demo ? 200 : 400;
  return Response.json(result, { status });
}

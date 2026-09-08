import {
  estimateJsonBodyBytes,
  MAX_CONVERT_BODY_BYTES,
  runConvertRequest,
} from "@/app/lib/server-convert";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (Number.isFinite(len) && len > MAX_CONVERT_BODY_BYTES) {
      return Response.json(
        {
          ok: false,
          error: `Request body exceeds ${MAX_CONVERT_BODY_BYTES} byte limit.`,
        },
        { status: 413 },
      );
    }
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json(
      { ok: false, error: "Unable to read request body." },
      { status: 400 },
    );
  }

  if (!raw || !raw.trim()) {
    return Response.json(
      { ok: false, error: "Request body is empty." },
      { status: 400 },
    );
  }

  if (estimateJsonBodyBytes(raw) > MAX_CONVERT_BODY_BYTES) {
    return Response.json(
      {
        ok: false,
        error: `Request body exceeds ${MAX_CONVERT_BODY_BYTES} byte limit.`,
      },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const { status, payload } = runConvertRequest(body);
  return Response.json(payload, { status });
}

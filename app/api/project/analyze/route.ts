import { handleProjectMultipart } from "@/app/lib/server-project";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleProjectMultipart(request, "analyze");
}

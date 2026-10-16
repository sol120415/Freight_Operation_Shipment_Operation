import { createClient } from "@/lib/supabase/server";
import { recommendRoutes, aiEnabled } from "@/lib/ai";
import { getActiveExamples, buildFewShotPrefix } from "@/lib/ai-training";
import {
  requireUser,
  validate,
  withErrors,
  rateLimit,
  clientIp,
  jsonOk,
  ApiError,
} from "@/lib/server/api";
import { routingRequestSchema } from "@/lib/validation/schemas";
import { checkPermission } from "@/lib/auth";

const RATE_LIMIT = { perMinute: 20 };

export async function POST(request: Request) {
  return withErrors(async () => {
    const supabase = await createClient();
    await requireUser(supabase);
    const permission = await checkPermission("planning.manage");
    if ("error" in permission) {
      throw new ApiError(403, "You are not allowed to request freight routes");
    }

    if (!aiEnabled()) {
      throw new ApiError(
        503,
        "AI provider not configured. Set GROQ_API_KEY or GEMINI_API_KEY.",
      );
    }
    if (!rateLimit(`ai:routing:${clientIp(request)}`, RATE_LIMIT.perMinute)) {
      throw new ApiError(429, "Rate limit exceeded; try again shortly");
    }

    const body = await request
      .json()
      .catch(() => {
        throw new ApiError(400, "Invalid JSON body");
      });
    const input = validate(routingRequestSchema, body);

    try {
      const examples = await getActiveExamples("routing");
      const routes = await recommendRoutes(input, buildFewShotPrefix(examples));
      return jsonOk({ routes });
    } catch (e) {
      throw new ApiError(502, e instanceof Error ? e.message : "Routing failed");
    }
  }, "routing");
}

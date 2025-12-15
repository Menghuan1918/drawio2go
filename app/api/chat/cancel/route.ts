import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger("Chat Cancel API");

type CancelBody = {
  chatRunId?: unknown;
  reason?: unknown;
};

export async function POST(req: NextRequest) {
  let body: CancelBody | null = null;

  try {
    body = (await req.json()) as CancelBody;
  } catch {
    body = null;
  }

  const chatRunId =
    typeof body?.chatRunId === "string" ? body.chatRunId.trim() : "";
  const reason =
    typeof body?.reason === "string" ? body.reason.trim() : "user_cancelled";

  if (!chatRunId) {
    return new NextResponse(null, { status: 204 });
  }

  const cancelledChatRunIds =
    global.cancelledChatRunIds ?? (global.cancelledChatRunIds = new Map());
  cancelledChatRunIds.set(chatRunId, Date.now());

  const controller = global.chatAbortControllers?.get(chatRunId);
  if (controller) {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }
  global.chatAbortControllers?.delete(chatRunId);

  const pendingRequests = global.pendingRequests;
  const io = global.io;

  if (pendingRequests) {
    for (const [requestId, pending] of pendingRequests.entries()) {
      if (pending.chatRunId !== chatRunId) continue;

      pendingRequests.delete(requestId);

      const projectUuid = pending.projectUuid?.trim();
      const conversationId = pending.conversationId?.trim();

      if (projectUuid && conversationId && io) {
        try {
          io.to(projectUuid).emit("tool:cancel", {
            requestId,
            projectUuid,
            conversationId,
            chatRunId,
            reason,
          });
        } catch {
          // best-effort
        }
      }

      try {
        pending.reject(new Error("聊天已取消"));
      } catch {
        // ignore
      }
    }
  }

  logger.info("已取消 chatRunId", { chatRunId, reason });
  return new NextResponse(null, { status: 204 });
}

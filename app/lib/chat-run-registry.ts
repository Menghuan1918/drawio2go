"use client";

const activeRunByConversationId = new Map<string, string>();

/**
 * 已取消的 chatRunId 集合
 * 使用 LRU 风格的清理策略，限制最大条目数为 500
 */
const cancelledRunIds = new Set<string>();
const MAX_CANCELLED_RUN_IDS = 500;

export function setActiveChatRun(conversationId: string, chatRunId: string) {
  const normalizedConversationId = conversationId.trim();
  const normalizedChatRunId = chatRunId.trim();
  if (!normalizedConversationId || !normalizedChatRunId) return;
  activeRunByConversationId.set(normalizedConversationId, normalizedChatRunId);
}

export function clearActiveChatRun(conversationId: string, chatRunId?: string) {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) return;

  if (!chatRunId) {
    activeRunByConversationId.delete(normalizedConversationId);
    return;
  }

  const normalizedChatRunId = chatRunId.trim();
  const current = activeRunByConversationId.get(normalizedConversationId);
  if (current === normalizedChatRunId) {
    activeRunByConversationId.delete(normalizedConversationId);
  }
}

export function getActiveChatRun(conversationId: string): string | null {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) return null;
  return activeRunByConversationId.get(normalizedConversationId) ?? null;
}

export function cancelChatRun(chatRunId: string) {
  const normalizedChatRunId = chatRunId.trim();
  if (!normalizedChatRunId) return;

  // 添加到已取消集合
  cancelledRunIds.add(normalizedChatRunId);

  // LRU 清理：超出最大条目数时删除最早的条目
  if (cancelledRunIds.size > MAX_CANCELLED_RUN_IDS) {
    const iterator = cancelledRunIds.values();
    const firstValue = iterator.next().value;
    if (firstValue !== undefined) {
      cancelledRunIds.delete(firstValue);
    }
  }
}

export function isChatRunCancelled(chatRunId: string): boolean {
  const normalizedChatRunId = chatRunId.trim();
  if (!normalizedChatRunId) return false;
  return cancelledRunIds.has(normalizedChatRunId);
}

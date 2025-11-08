"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import {
  useStorageSettings,
  useStorageConversations,
  useStorageXMLVersions,
} from "@/app/hooks";
import type { LLMConfig } from "@/app/types/chat";
import type {
  Conversation,
  Message,
  CreateMessageInput,
} from "@/app/lib/storage";
import { DEFAULT_LLM_CONFIG, normalizeLLMConfig } from "@/app/lib/config-utils";

// 导入拆分后的组件
import ChatSessionHeader from "./chat/ChatSessionHeader";
import ChatSessionMenu from "./chat/ChatSessionMenu";
import MessageList from "./chat/MessageList";
import ChatInputArea from "./chat/ChatInputArea";

// 导入工具函数和常量
import {
  showSaveDialog,
  writeFile,
  downloadFile,
} from "./chat/utils/fileOperations";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// ========== 数据转换工具函数 ==========

/**
 * 将存储的 Message 转换为 UIMessage（用于 @ai-sdk/react）
 * AI SDK 5.0 使用 parts 数组结构
 */
function convertMessageToUIMessage(msg: Message): UIMessage {
  // 尝试解析 tool_invocations
  const parts: UIMessage["parts"] = [];

  // 添加文本部分
  if (msg.content) {
    parts.push({
      type: "text",
      text: msg.content,
    });
  }

  // 添加工具调用部分（如果存在）
  if (msg.tool_invocations) {
    try {
      const toolInvocations = JSON.parse(msg.tool_invocations);
      if (Array.isArray(toolInvocations)) {
        for (const invocation of toolInvocations) {
          parts.push({
            type: "tool-invocation",
            toolInvocation: invocation,
          } as unknown as UIMessage["parts"][number]);
        }
      }
    } catch (e) {
      console.error(
        "[convertMessageToUIMessage] 解析 tool_invocations 失败:",
        e,
      );
    }
  }

  return {
    id: msg.id,
    role: msg.role as "user" | "assistant" | "system",
    parts,
  };
}

/**
 * 将 UIMessage 转换为 CreateMessageInput（用于存储）
 * 提取所有 text parts 合并为 content，保存 tool-invocation parts 为 tool_invocations
 */
function convertUIMessageToCreateInput(
  uiMsg: UIMessage,
  conversationId: string,
): CreateMessageInput {
  // 提取所有文本部分
  const textParts = uiMsg.parts.filter((part) => part.type === "text");
  const content = textParts
    .map((part) => ("text" in part ? part.text : ""))
    .join("\n");

  // 提取所有工具调用部分
  const toolParts = uiMsg.parts.filter(
    (part) => part.type === "tool-invocation",
  );
  const tool_invocations =
    toolParts.length > 0
      ? JSON.stringify(
          toolParts.map((part) =>
            "toolInvocation" in part ? part.toolInvocation : null,
          ),
        )
      : undefined;

  return {
    id: uiMsg.id,
    conversation_id: conversationId,
    role: uiMsg.role as "user" | "assistant" | "system",
    content,
    tool_invocations,
  };
}

/**
 * 生成对话标题（从消息列表）
 */
function generateTitle(messages: UIMessage[]): string {
  if (messages.length === 0) return "新对话";

  const firstUserMessage = messages.find((msg) => msg.role === "user");
  if (!firstUserMessage) return "新对话";

  // 从 parts 中提取第一个文本
  const textPart = firstUserMessage.parts.find((part) => part.type === "text");
  const text = textPart && "text" in textPart ? textPart.text : "";

  return text.trim().slice(0, 30) || "新对话";
}

// ========== 主组件 ==========

export default function ChatSidebar({}: ChatSidebarProps) {
  const [input, setInput] = useState("");
  const [expandedToolCalls, setExpandedToolCalls] = useState<
    Record<string, boolean>
  >({});
  const [expandedThinkingBlocks, setExpandedThinkingBlocks] = useState<
    Record<string, boolean>
  >({});
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ========== 存储 Hooks ==========
  const { getLLMConfig, error: settingsError } = useStorageSettings();

  const {
    createConversation,
    getAllConversations,
    updateConversation,
    deleteConversation: deleteConversationFromStorage,
    getMessages,
    addMessages,
    error: conversationsError,
  } = useStorageConversations();

  const { getAllXMLVersions, saveXML } = useStorageXMLVersions();

  // ========== 本地状态 ==========
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [conversationMessages, setConversationMessages] = useState<
    Record<string, UIMessage[]>
  >({});
  const [defaultXmlVersionId, setDefaultXmlVersionId] = useState<number | null>(
    null,
  );

  // 使用 ref 来跟踪发送消息时的会话ID
  const sendingSessionIdRef = useRef<string | null>(null);

  // ========== 派生状态 ==========
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const initialMessages = useMemo(() => {
    return activeConversationId
      ? conversationMessages[activeConversationId] || []
      : [];
  }, [activeConversationId, conversationMessages]);

  // 为 ChatSessionMenu 构造兼容的数据格式
  const sessionsData = useMemo(() => {
    if (conversations.length === 0 || !activeConversationId) return null;

    const sessionsMap: Record<
      string,
      {
        id: string;
        title: string;
        messages: UIMessage[];
        createdAt: number;
        updatedAt: number;
      }
    > = {};
    conversations.forEach((conv) => {
      sessionsMap[conv.id] = {
        id: conv.id,
        title: conv.title,
        messages: conversationMessages[conv.id] || [],
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      };
    });

    return {
      sessions: sessionsMap,
      activeSessionId: activeConversationId,
      sessionOrder: conversations.map((c) => c.id),
    };
  }, [conversations, activeConversationId, conversationMessages]);

  // ========== 初始化 ==========
  useEffect(() => {
    async function initialize() {
      try {
        // 1. 加载 LLM 配置
        const config = await getLLMConfig();
        if (config) {
          const normalized = normalizeLLMConfig(config);
          setLlmConfig(normalized);
        } else {
          setLlmConfig({ ...DEFAULT_LLM_CONFIG });
        }
        setConfigLoading(false);

        // 2. 确保有默认 XML 版本
        const xmlVersions = await getAllXMLVersions();
        let defaultVersionId: number;

        if (xmlVersions.length === 0) {
          // 创建默认空白 XML 版本
          const defaultXml = await saveXML(
            '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
            undefined,
            "默认版本",
            "初始版本",
          );
          defaultVersionId = defaultXml.id;
        } else {
          // 使用最新的 XML 版本
          defaultVersionId = xmlVersions[0].id;
        }
        setDefaultXmlVersionId(defaultVersionId);

        // 3. 加载所有对话
        const allConversations = await getAllConversations();
        setConversations(allConversations);

        // 4. 如果没有对话，创建默认对话
        if (allConversations.length === 0) {
          const newConv = await createConversation(defaultVersionId, "新对话");
          setConversations([newConv]);
          setActiveConversationId(newConv.id);
          setConversationMessages({ [newConv.id]: [] });
        } else {
          // 激活最新的对话
          const latestConv = allConversations[0];
          setActiveConversationId(latestConv.id);

          // 加载所有对话的消息
          const messagesMap: Record<string, UIMessage[]> = {};
          for (const conv of allConversations) {
            const messages = await getMessages(conv.id);
            messagesMap[conv.id] = messages.map(convertMessageToUIMessage);
          }
          setConversationMessages(messagesMap);
        }
      } catch (error) {
        console.error("[ChatSidebar] 初始化失败:", error);
        // 降级到默认配置
        setLlmConfig({ ...DEFAULT_LLM_CONFIG });
        setConfigLoading(false);
      }
    }

    initialize();
  }, [
    getLLMConfig,
    getAllXMLVersions,
    getAllConversations,
    getMessages,
    createConversation,
    saveXML,
  ]);

  // ========== useChat 集成 ==========
  const {
    messages,
    sendMessage,
    status,
    stop,
    error: chatError,
  } = useChat({
    id: activeConversationId || "default",
    messages: initialMessages,
    onFinish: async ({ messages: finishedMessages }) => {
      const targetSessionId = sendingSessionIdRef.current;

      if (!targetSessionId) {
        console.error("[ChatSidebar] onFinish: 没有记录的目标会话ID");
        return;
      }

      try {
        // 将 UIMessage[] 转换为 CreateMessageInput[]
        const messagesToSave = finishedMessages.map((msg) =>
          convertUIMessageToCreateInput(msg, targetSessionId),
        );

        // 批量保存到存储
        await addMessages(messagesToSave);

        // 更新本地缓存
        setConversationMessages((prev) => ({
          ...prev,
          [targetSessionId]: finishedMessages,
        }));

        // 更新对话标题（如果对话已被删除，则重新创建）
        const title = generateTitle(finishedMessages);
        try {
          await updateConversation(targetSessionId, { title });

          // 更新本地对话列表中的标题
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === targetSessionId
                ? { ...conv, title, updated_at: Date.now() }
                : conv,
            ),
          );

          console.log("[ChatSidebar] 消息已保存到对话:", targetSessionId);
        } catch (updateError) {
          // 检查是否为"对话不存在"错误
          const errorMessage =
            updateError instanceof Error
              ? updateError.message
              : String(updateError);
          if (errorMessage.includes("Conversation not found")) {
            console.warn(
              `[ChatSidebar] 对话不存在 (${targetSessionId})，尝试重新创建对话`,
            );

            // 对话已被删除，需要重新创建并保存消息
            if (defaultXmlVersionId) {
              try {
                const newConv = await createConversation(
                  defaultXmlVersionId,
                  title,
                );
                console.log(
                  `[ChatSidebar] 已创建新对话: ${newConv.id} (标题: ${title})`,
                );

                // 将消息重新映射到新对话ID
                const remappedMessages = finishedMessages.map((msg) =>
                  convertUIMessageToCreateInput(msg, newConv.id),
                );
                await addMessages(remappedMessages);

                // 更新本地状态
                setConversations((prev) => [newConv, ...prev]);
                setActiveConversationId(newConv.id);
                setConversationMessages((prev) => ({
                  ...prev,
                  [newConv.id]: finishedMessages,
                }));

                console.log(
                  "[ChatSidebar] 消息已保存到新创建的对话:",
                  newConv.id,
                );
              } catch (recreateError) {
                console.error(
                  "[ChatSidebar] 重新创建对话失败:",
                  recreateError,
                );
                throw recreateError;
              }
            } else {
              console.error(
                "[ChatSidebar] 无法重新创建对话：缺少默认 XML 版本",
              );
              throw updateError;
            }
          } else {
            // 其他错误直接抛出
            throw updateError;
          }
        }
      } catch (error) {
        console.error("[ChatSidebar] 保存消息失败:", error);
      } finally {
        sendingSessionIdRef.current = null;
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isChatStreaming = status === "submitted" || status === "streaming";

  // ========== 事件处理函数 ==========

  const submitMessage = async () => {
    const trimmedInput = input.trim();

    if (!trimmedInput || !llmConfig || configLoading || isChatStreaming) {
      return;
    }

    let targetSessionId = activeConversationId;

    // 防御性检查：如果没有活动会话，先创建一个
    if (!targetSessionId) {
      console.warn(
        "[ChatSidebar] 检测到没有活动会话，尝试自动创建新对话",
      );

      if (!defaultXmlVersionId) {
        console.error(
          "[ChatSidebar] 无法发送消息：缺少默认 XML 版本，无法创建对话",
        );
        return;
      }

      try {
        const newConv = await createConversation(defaultXmlVersionId, "新对话");
        console.log(
          `[ChatSidebar] 已自动创建新对话: ${newConv.id} (标题: 新对话)`,
        );

        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        setConversationMessages((prev) => ({ ...prev, [newConv.id]: [] }));

        targetSessionId = newConv.id;
      } catch (error) {
        console.error("[ChatSidebar] 创建新对话失败:", error);
        return;
      }
    }

    sendingSessionIdRef.current = targetSessionId;
    console.log("[ChatSidebar] 开始发送消息到会话:", targetSessionId);

    setInput("");

    try {
      await sendMessage(
        { text: trimmedInput },
        {
          body: { llmConfig },
        },
      );
    } catch (error) {
      console.error("[ChatSidebar] 发送消息失败:", error);
      sendingSessionIdRef.current = null;
      setInput(trimmedInput);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const handleCancel = () => {
    if (isChatStreaming) {
      stop();
    }
  };

  const handleNewChat = useCallback(async () => {
    if (!defaultXmlVersionId) {
      console.error("[ChatSidebar] 无法创建新对话：没有默认 XML 版本");
      return;
    }

    try {
      const newConv = await createConversation(defaultXmlVersionId, "新对话");
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setConversationMessages((prev) => ({ ...prev, [newConv.id]: [] }));
    } catch (error) {
      console.error("[ChatSidebar] 创建新对话失败:", error);
    }
  }, [defaultXmlVersionId, createConversation]);

  const handleHistory = () => {
    setShowSessionMenu(!showSessionMenu);
  };

  const handleDeleteSession = useCallback(async () => {
    if (!activeConversation) return;

    if (conversations.length === 1) {
      alert("至少需要保留一个会话");
      return;
    }

    if (confirm(`确定要删除会话 "${activeConversation.title}" 吗？`)) {
      try {
        await deleteConversationFromStorage(activeConversation.id);

        // 更新本地状态
        const newConversations = conversations.filter(
          (c) => c.id !== activeConversation.id,
        );
        setConversations(newConversations);

        // 切换到第一个剩余对话
        if (newConversations.length > 0) {
          setActiveConversationId(newConversations[0].id);
        }

        // 清理消息缓存
        setConversationMessages((prev) => {
          const newMessages = { ...prev };
          delete newMessages[activeConversation.id];
          return newMessages;
        });
      } catch (error) {
        console.error("[ChatSidebar] 删除对话失败:", error);
        alert("删除失败");
      }
    }
  }, [activeConversation, conversations, deleteConversationFromStorage]);

  const handleExportSession = async () => {
    if (!activeConversation) return;

    const messages = conversationMessages[activeConversation.id] || [];
    const exportData = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      sessions: [
        {
          id: activeConversation.id,
          title: activeConversation.title,
          messages,
          createdAt: activeConversation.created_at,
          updatedAt: activeConversation.updated_at,
        },
      ],
    };

    const jsonData = JSON.stringify(exportData, null, 2);
    const defaultPath = `chat-${activeConversation.title}.json`;
    const filePath = await showSaveDialog({
      defaultPath,
      filters: [{ name: "JSON 文件", extensions: ["json"] }],
    });

    if (filePath) {
      const success = await writeFile(filePath, jsonData);
      if (success) {
        alert("导出成功！");
      } else {
        alert("导出失败");
      }
    } else {
      downloadFile(jsonData, `chat-${activeConversation.title}.json`);
    }
  };

  const handleExportAllSessions = async () => {
    const allSessions = conversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      messages: conversationMessages[conv.id] || [],
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
    }));

    const exportData = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      sessions: allSessions,
    };

    const jsonData = JSON.stringify(exportData, null, 2);
    const defaultPath = `all-chats-${new Date().toISOString().split("T")[0]}.json`;
    const filePath = await showSaveDialog({
      defaultPath,
      filters: [{ name: "JSON 文件", extensions: ["json"] }],
    });

    if (filePath) {
      const success = await writeFile(filePath, jsonData);
      if (success) {
        alert("导出成功！");
      } else {
        alert("导出失败");
      }
    } else {
      downloadFile(
        jsonData,
        `all-chats-${new Date().toISOString().split("T")[0]}.json`,
      );
    }
  };

  const handleImportSessions = async () => {
    // 暂时保留，但导入功能需要适配新数据格式
    alert("导入功能暂未实现，将在后续版本中支持");
    return;

    // TODO: 实现聊天历史导入功能
    // 功能范围:
    // 1. 支持从 JSON 文件导入会话历史
    // 2. 读取并验证文件格式（需定义标准导入格式）
    // 3. 解析为 Conversation 和 Message 对象
    // 4. 保存到统一存储系统
    // 5. 处理导入冲突（ID 重复、时间戳等）
    // 6. 提供导入进度反馈
  };

  const handleVersionControl = () => {
    console.log("版本管理");
    // TODO: 实现 DrawIO XML 版本管理界面
    // 功能范围:
    // 1. 显示当前项目的所有 XML 版本历史
    // 2. 支持版本比对和预览
    // 3. 支持回滚到历史版本
    // 4. 显示版本元数据（创建时间、会话关联等）
    // 5. 支持版本导出和备份
  };

  const handleFileUpload = () => {
    console.log("文件上传");
    // TODO: 实现文件上传功能
    // 功能范围:
    // 1. 支持上传图片作为聊天上下文
    // 2. 支持上传 DrawIO XML 文件进行导入
    // 3. 文件类型验证和大小限制
    // 4. 上传进度显示
    // 5. 与当前会话关联
  };

  const handleSessionSelect = async (sessionId: string) => {
    setActiveConversationId(sessionId);
    setShowSessionMenu(false);

    // 如果消息尚未加载，立即加载
    if (!conversationMessages[sessionId]) {
      try {
        const messages = await getMessages(sessionId);
        setConversationMessages((prev) => ({
          ...prev,
          [sessionId]: messages.map(convertMessageToUIMessage),
        }));
      } catch (error) {
        console.error("[ChatSidebar] 加载消息失败:", error);
      }
    }
  };

  const handleToolCallToggle = (key: string) => {
    setExpandedToolCalls((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleThinkingBlockToggle = (messageId: string) => {
    setExpandedThinkingBlocks((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const combinedError =
    settingsError?.message ||
    conversationsError?.message ||
    chatError?.message ||
    null;

  return (
    <div className="chat-sidebar-content">
      {/* 消息内容区域 - 无分隔线一体化设计 */}
      <div className="chat-messages-area">
        {/* 会话标题栏 */}
        <ChatSessionHeader
          activeSession={
            activeConversation
              ? {
                  id: activeConversation.id,
                  title: activeConversation.title,
                  messages: conversationMessages[activeConversation.id] || [],
                  createdAt: activeConversation.created_at,
                  updatedAt: activeConversation.updated_at,
                }
              : null
          }
          showSessionMenu={showSessionMenu}
          onHistoryToggle={handleHistory}
          onDeleteSession={handleDeleteSession}
          onExportSession={handleExportSession}
          onExportAllSessions={handleExportAllSessions}
          onImportSessions={handleImportSessions}
        />

        {/* 会话选择菜单 */}
        <ChatSessionMenu
          showSessionMenu={showSessionMenu}
          sessionsData={sessionsData}
          activeSessionId={activeConversationId}
          onSessionSelect={handleSessionSelect}
        />

        {/* 消息列表 */}
        <MessageList
          messages={messages}
          configLoading={configLoading}
          llmConfig={llmConfig}
          status={status}
          expandedToolCalls={expandedToolCalls}
          expandedThinkingBlocks={expandedThinkingBlocks}
          onToolCallToggle={handleToolCallToggle}
          onThinkingBlockToggle={handleThinkingBlockToggle}
        />
      </div>

      {/* 底部输入区域 - 一体化设计 */}
      <ChatInputArea
        input={input}
        setInput={setInput}
        isChatStreaming={isChatStreaming}
        configLoading={configLoading}
        llmConfig={llmConfig}
        error={combinedError}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onNewChat={handleNewChat}
        onHistory={handleHistory}
        onVersionControl={handleVersionControl}
        onFileUpload={handleFileUpload}
      />
    </div>
  );
}

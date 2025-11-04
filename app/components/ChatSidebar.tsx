"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { useLLMConfig } from "@/app/hooks/useLLMConfig";
import { useChatSessions } from "@/app/hooks/useChatSessions";

// 导入拆分后的组件
import ChatSessionHeader from "./chat/ChatSessionHeader";
import ChatSessionMenu from "./chat/ChatSessionMenu";
import MessageList from "./chat/MessageList";
import ChatInputArea from "./chat/ChatInputArea";

// 导入工具函数和常量
import { showSaveDialog, showOpenDialog, writeFile, readFile, downloadFile, selectFile } from "./chat/utils/fileOperations";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatSidebar({ }: ChatSidebarProps) {
  const [input, setInput] = useState("");
  const [expandedToolCalls, setExpandedToolCalls] = useState<Record<string, boolean>>({});
  const [expandedThinkingBlocks, setExpandedThinkingBlocks] = useState<Record<string, boolean>>({});
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { config: llmConfig, isLoading: configLoading, error: configError } = useLLMConfig();

  // 会话管理
  const {
    sessionsData,
    activeSession,
    createSession,
    deleteSession,
    switchSession,
    updateSessionMessages,
    exportSession,
    exportAllSessions,
    importSessions,
  } = useChatSessions();

  // 初始消息（从当前活动会话加载）
  const initialMessages = useMemo(() => {
    return activeSession?.messages || [];
  }, [activeSession?.messages]); // 只在消息变化时重新计算

  // 使用 ref 来跟踪发送消息时的会话ID
  const sendingSessionIdRef = useRef<string | null>(null);

  const { messages, sendMessage, status, stop, error: chatError } = useChat({
    id: activeSession?.id || "default",
    messages: initialMessages,
    onFinish: ({ messages }) => {
      // 使用发送时记录的会话ID，而不是当前的 activeSession.id
      // 这彻底解决了竞态条件问题
      const targetSessionId = sendingSessionIdRef.current;

      if (!targetSessionId) {
        console.error("[ChatSidebar] onFinish: 没有记录的目标会话ID");
        // 开发模式下抛出错误，便于发现问题
        if (process.env.NODE_ENV === 'development') {
          throw new Error('会话消息保存失败：没有记录目标会话ID。这可能是由于组件卸载导致的竞态条件。');
        }
        return;
      }

      // 验证会话是否仍然存在
      const sessionExists = sessionsData?.sessions[targetSessionId];
      if (sessionExists) {
        updateSessionMessages(targetSessionId, messages);
        console.log("[ChatSidebar] 消息已保存到会话:", targetSessionId);

        // 开发模式下检测会话切换情况
        if (process.env.NODE_ENV === 'development' && activeSession?.id !== targetSessionId) {
          console.warn(`[ChatSidebar] 检测到会话切换：消息保存到 ${targetSessionId}，但当前活动会话是 ${activeSession?.id || 'none'}`);
        }
      } else {
        console.error("[ChatSidebar] 目标会话不存在，无法保存消息:", targetSessionId);
        // 开发模式下抛出错误，便于发现问题
        if (process.env.NODE_ENV === 'development') {
          throw new Error(`会话消息保存失败：目标会话 ${targetSessionId} 不存在。`);
        }
      }

      // 清除记录的会话ID
      sendingSessionIdRef.current = null;
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isChatStreaming = status === "submitted" || status === "streaming";

  // 事件处理函数
  const submitMessage = async () => {
    const trimmedInput = input.trim();

    if (!trimmedInput || !llmConfig || configLoading || isChatStreaming) {
      return;
    }

    // 在发送消息时捕获当前会话ID，避免竞态条件
    const targetSessionId = activeSession?.id;

    if (!targetSessionId) {
      console.error("[ChatSidebar] 无法发送消息：没有活动会话");
      return;
    }

    // 记录发送消息时的会话ID，确保 onFinish 回调使用正确的会话
    sendingSessionIdRef.current = targetSessionId;
    console.log("[ChatSidebar] 开始发送消息到会话:", targetSessionId);

    // 在完成发送前清空输入框，提升响应速度
    setInput("");

    try {
      await sendMessage({ text: trimmedInput }, {
        body: { llmConfig },
      });
    } catch (error) {
      console.error("[ChatSidebar] 发送消息失败:", error);
      // 发送失败时清除记录的会话ID
      sendingSessionIdRef.current = null;
      // 恢复用户输入，便于重试
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

  const handleNewChat = () => {
    createSession();
  };

  const handleHistory = () => {
    setShowSessionMenu(!showSessionMenu);
  };

  const handleDeleteSession = () => {
    if (!activeSession || !sessionsData) return;

    // 如果只有一个会话，不允许删除
    if (sessionsData.sessionOrder.length === 1) {
      alert("至少需要保留一个会话");
      return;
    }

    if (confirm(`确定要删除会话 "${activeSession.title}" 吗？`)) {
      deleteSession(activeSession.id);
    }
  };

  const handleExportSession = async () => {
    if (!activeSession) return;

    const jsonData = exportSession(activeSession.id);
    if (!jsonData) return;

    const defaultPath = `chat-${activeSession.title}.json`;
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
      // 浏览器环境，使用下载
      downloadFile(jsonData, `chat-${activeSession.title}.json`);
    }
  };

  const handleExportAllSessions = async () => {
    const jsonData = exportAllSessions();
    if (!jsonData) return;

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
      // 浏览器环境，使用下载
      downloadFile(jsonData, `all-chats-${new Date().toISOString().split("T")[0]}.json`);
    }
  };

  const handleImportSessions = async () => {
    const filePaths = await showOpenDialog({
      filters: [{ name: "JSON 文件", extensions: ["json"] }],
      properties: ["openFile"],
    });

    if (filePaths && filePaths.length > 0) {
      const jsonData = await readFile(filePaths[0]);
      if (jsonData) {
        const success = importSessions(jsonData);
        if (success) {
          alert("导入成功！");
        } else {
          alert("导入失败，请检查文件格式");
        }
      }
    } else {
      // 浏览器环境，使用文件选择
      const text = await selectFile("application/json");
      if (text) {
        const success = importSessions(text);
        if (success) {
          alert("导入成功！");
        } else {
          alert("导入失败，请检查文件格式");
        }
      }
    }
  };

  const handleVersionControl = () => {
    console.log("版本管理");
    // TODO: 打开版本管理界面
  };

  const handleFileUpload = () => {
    console.log("文件上传");
    // TODO: 打开文件选择器
  };

  const handleSessionSelect = (sessionId: string) => {
    switchSession(sessionId);
    setShowSessionMenu(false);
  };

  const handleToolCallToggle = (key: string) => {
    setExpandedToolCalls(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleThinkingBlockToggle = (messageId: string) => {
    setExpandedThinkingBlocks(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const combinedError = configError || chatError?.message || null;

  return (
    <div className="chat-sidebar-content">
      {/* 消息内容区域 - 无分隔线一体化设计 */}
      <div className="chat-messages-area">
        {/* 会话标题栏 */}
        <ChatSessionHeader
          activeSession={activeSession}
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
          activeSessionId={activeSession?.id || null}
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

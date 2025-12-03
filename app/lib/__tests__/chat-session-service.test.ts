import {
  convertMessageToUIMessage,
  convertUIMessageToCreateInput,
} from "@/app/lib/chat-session-service";
import type { Message } from "@/app/lib/storage";
import type { ChatUIMessage } from "@/app/types/chat";
import { describe, expect, it, vi } from "vitest";

const baseMeta = { modelName: "test-model", createdAt: 1_700_000_000_000 };

describe("convertUIMessageToCreateInput", () => {
  it("序列化包含 reasoning 的消息", () => {
    const uiMsg: ChatUIMessage = {
      id: "msg-reasoning",
      role: "assistant",
      parts: [{ type: "reasoning", text: "Let me think...", state: "done" }],
      metadata: baseMeta,
    };

    const created = convertUIMessageToCreateInput(uiMsg, "conv-1");
    const parsed = JSON.parse(created.parts_structure);

    expect(parsed).toEqual(uiMsg.parts);
    expect(created.role).toBe("assistant");
  });

  it("序列化 text + tool + reasoning，保持顺序", () => {
    const uiMsg: ChatUIMessage = {
      id: "msg-mixed",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "Step 1", state: "done" },
        { type: "text", text: "Hi" },
        {
          type: "dynamic-tool",
          toolName: "drawio_read",
          toolCallId: "call-1",
          state: "output-available",
          input: { path: "a.drawio" },
          output: { ok: true },
        },
      ],
      metadata: baseMeta,
    };

    const created = convertUIMessageToCreateInput(uiMsg, "conv-2", "xml-1");
    const parsed = JSON.parse(created.parts_structure);

    // 工具 part 被规范化为 dynamic-tool
    expect(parsed.map((p: { type: string }) => p.type)).toEqual([
      "reasoning",
      "text",
      "dynamic-tool",
    ]);
    expect(created.xml_version_id).toBe("xml-1");
  });

  it("序列化空 parts 数组", () => {
    const uiMsg: ChatUIMessage = {
      id: "msg-empty",
      role: "user",
      parts: [],
      metadata: baseMeta,
    };

    const created = convertUIMessageToCreateInput(uiMsg, "conv-empty");
    expect(JSON.parse(created.parts_structure)).toEqual([]);
  });
});

describe("convertMessageToUIMessage", () => {
  it("正常解析 reasoning/text/tool 并保持顺序", () => {
    const parts = [
      { type: "reasoning", text: "think", state: "done" },
      { type: "text", text: "answer" },
      {
        type: "tool-drawio_read",
        toolName: "drawio_read",
        toolCallId: "call-2",
        state: "output-available",
        output: { foo: "bar" },
      },
    ];

    const msg: Message = {
      id: "m-1",
      conversation_id: "conv-1",
      role: "assistant",
      parts_structure: JSON.stringify(parts),
      model_name: "deepseek",
      created_at: 123,
      sequence_number: 1,
    };

    const ui = convertMessageToUIMessage(msg);
    expect(ui.parts.map((p) => (p as { type: string }).type)).toEqual([
      "reasoning",
      "text",
      "tool-drawio_read",
    ]);
    expect(ui.metadata).toBeDefined();
    expect(ui.metadata!.modelName).toBe("deepseek");
  });

  it("工具 part 规范化：tool-call → tool-<name>", () => {
    const rawTool = {
      type: "tool-call",
      toolName: "drawio_read",
      toolCallId: "call-x",
      input: { path: "diagram.xml" },
    };

    const msg: Message = {
      id: "m-2",
      conversation_id: "conv-2",
      role: "assistant",
      parts_structure: JSON.stringify([rawTool]),
      created_at: 456,
      sequence_number: 1,
      model_name: null,
    };

    const ui = convertMessageToUIMessage(msg);
    const part = ui.parts[0] as {
      type: string;
      toolName: string;
      toolCallId: string;
      state: string;
      input?: unknown;
    };

    expect(part.type).toBe("tool-drawio_read");
    expect(part.toolName).toBe("drawio_read");
    expect(part.toolCallId).toBe("call-x");
    expect(part.state).toBe("input-available");
    expect(part.input).toEqual({ path: "diagram.xml" });
  });

  it("无效 JSON 与空字符串返回空 parts 并记录错误", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const badMsg: Message = {
      id: "m-bad",
      conversation_id: "conv-bad",
      role: "assistant",
      parts_structure: "not-json",
      created_at: 1,
      sequence_number: 1,
      model_name: null,
    };

    const emptyMsg: Message = {
      ...badMsg,
      id: "m-empty",
      parts_structure: "",
    };

    expect(convertMessageToUIMessage(badMsg).parts).toEqual([]);
    expect(convertMessageToUIMessage(emptyMsg).parts).toEqual([]);
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe("往返序列化/反序列化", () => {
  it("保持 text/reasoning/tool 数据与顺序", () => {
    const uiMsg: ChatUIMessage = {
      id: "roundtrip-1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "R", state: "done" },
        { type: "text", text: "Hello" },
        {
          type: "dynamic-tool",
          toolName: "drawio_read",
          toolCallId: "call-rt",
          state: "output-available",
          input: {},
          output: { result: true },
        },
      ],
      metadata: baseMeta,
    };

    const createInput = convertUIMessageToCreateInput(
      uiMsg,
      "conv-rt",
      "xml-rt",
    );

    const stored: Message = {
      ...createInput,
      created_at: createInput.created_at ?? baseMeta.createdAt,
      sequence_number: 10,
    };

    const roundtrip = convertMessageToUIMessage(stored);

    expect(roundtrip.id).toBe(uiMsg.id);
    expect(roundtrip.role).toBe(uiMsg.role);
    // 往返后，工具 part 被规范化为 dynamic-tool
    expect(roundtrip.parts.map((p) => (p as { type: string }).type)).toEqual([
      "reasoning",
      "text",
      "dynamic-tool",
    ]);
    expect(roundtrip.metadata).toBeDefined();
    expect(roundtrip.metadata!.modelName).toBe(uiMsg.metadata?.modelName);
  });
});

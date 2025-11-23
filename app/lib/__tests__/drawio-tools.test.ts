import { describe, expect, it, beforeEach, vi } from "vitest";
import { replaceDrawioXML } from "../drawio-tools";
import { WIP_VERSION } from "../storage/constants";
import type { StorageAdapter } from "../storage/adapter";

// Mock 依赖模块
vi.mock("../storage/storage-factory", () => ({
  getStorage: vi.fn(),
}));

vi.mock("../storage/current-project", () => ({
  resolveCurrentProjectUuid: vi.fn(),
}));

vi.mock("../drawio-xml-utils", () => ({
  normalizeDiagramXml: vi.fn((xml: string) => xml),
}));

vi.mock("../storage", () => ({
  buildPageMetadataFromXml: vi.fn(() => ({
    pageCount: 1,
    pageNames: ["Page-1"],
  })),
}));

vi.mock("../storage/xml-version-engine", () => ({
  computeVersionPayload: vi.fn(() =>
    Promise.resolve({
      xml_content: "test",
      source_version_id: null,
      is_keyframe: true,
      diff_chain_depth: 0,
    }),
  ),
  materializeVersionXml: vi.fn(),
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-uuid"),
}));

const VALID_XML = `<mxfile><diagram id="1">Valid</diagram></mxfile>`;
const INVALID_XML = `<mxfile><diagram id="1">Invalid</diagram></mxfile>`;

// Mock 存储
const createMockStorage = (
  shouldFailSnapshot = false,
  shouldFailRollback = false,
) => {
  const mockStorage = {
    getProject: vi
      .fn()
      .mockResolvedValue({ id: "project-1", name: "Test Project" }),
    getXMLVersionsByProject: vi.fn().mockResolvedValue([
      {
        id: "version-1",
        semantic_version: WIP_VERSION,
        xml_content: VALID_XML,
        is_keyframe: true,
      },
    ]),
    getXMLVersion: vi.fn(),
    updateXMLVersion: vi.fn(),
    createXMLVersion: vi.fn(),
  };

  if (shouldFailSnapshot) {
    // 模拟快照获取失败
    mockStorage.getXMLVersionsByProject.mockResolvedValue([]);
  }

  if (shouldFailRollback) {
    // 第一次调用成功（保存无效 XML），第二次调用失败（回滚）
    let callCount = 0;
    mockStorage.updateXMLVersion.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve();
      } else {
        return Promise.reject(new Error("Storage unavailable"));
      }
    });
  }

  return mockStorage;
};

describe("replaceDrawioXML - 回滚错误处理", () => {
  let mockDispatchEvent: ReturnType<typeof vi.fn>;
  let mockAddEventListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window.dispatchEvent 和 addEventListener
    mockDispatchEvent = vi.fn();
    mockAddEventListener = vi.fn();

    global.window = {
      dispatchEvent: mockDispatchEvent,
      addEventListener: mockAddEventListener,
      setTimeout: global.setTimeout,
      clearTimeout: global.clearTimeout,
    } as unknown as Window & typeof globalThis;

    // Mock crypto.randomUUID
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "test-request-id"),
    });

    // Mock DOMParser for XML validation
    global.DOMParser = class {
      parseFromString() {
        return {
          querySelector: () => null, // 无 parsererror，表示 XML 有效
        };
      }
    } as unknown as typeof DOMParser;
  });

  it("场景 1：回滚成功 - 快照可用且写入成功", async () => {
    const { getStorage } = await import("../storage/storage-factory");
    const { resolveCurrentProjectUuid } = await import(
      "../storage/current-project"
    );
    const { materializeVersionXml } = await import(
      "../storage/xml-version-engine"
    );

    const mockStorage = createMockStorage();
    vi.mocked(getStorage).mockResolvedValue(
      mockStorage as unknown as StorageAdapter,
    );
    vi.mocked(resolveCurrentProjectUuid).mockResolvedValue("project-1");
    vi.mocked(materializeVersionXml).mockResolvedValue(VALID_XML);

    // 模拟 DrawIO merge 错误事件
    mockAddEventListener.mockImplementation((event, handler) => {
      if (event === "drawio-merge-error") {
        setTimeout(() => {
          handler({
            detail: {
              error: "merge_failed",
              requestId: "test-request-id",
            },
          });
        }, 10);
      }
    });

    const result = await replaceDrawioXML(INVALID_XML);

    expect(result.success).toBe(false);
    expect(result.error).toBe("drawio_syntax_error");
    expect(result.message).toBe(
      "DrawIO 报告 XML 语法错误，已自动回滚到修改前状态",
    );
  });

  it("场景 2：回滚失败 - 快照未获取", async () => {
    const { getStorage } = await import("../storage/storage-factory");
    const { resolveCurrentProjectUuid } = await import(
      "../storage/current-project"
    );
    const { materializeVersionXml } = await import(
      "../storage/xml-version-engine"
    );

    // 模拟项目不存在，导致快照获取失败
    const mockStorage = {
      getProject: vi.fn().mockResolvedValue(null), // 项目不存在
      getXMLVersionsByProject: vi.fn(),
      getXMLVersion: vi.fn(),
      updateXMLVersion: vi.fn(),
      createXMLVersion: vi.fn(),
    };

    vi.mocked(getStorage).mockResolvedValue(
      mockStorage as unknown as StorageAdapter,
    );
    vi.mocked(resolveCurrentProjectUuid).mockResolvedValue("project-1");
    vi.mocked(materializeVersionXml).mockResolvedValue(VALID_XML);

    // 第二次调用 getStorage（保存新 XML 时）返回正常的存储
    let getStorageCallCount = 0;
    vi.mocked(getStorage).mockImplementation(async () => {
      getStorageCallCount++;
      if (getStorageCallCount === 1) {
        // 第一次：快照获取时项目不存在
        return mockStorage as unknown as StorageAdapter;
      } else {
        // 第二次：保存时项目存在
        return {
          ...mockStorage,
          getProject: vi
            .fn()
            .mockResolvedValue({ id: "project-1", name: "Test Project" }),
          getXMLVersionsByProject: vi.fn().mockResolvedValue([
            {
              id: "version-1",
              semantic_version: "__wip__",
              xml_content: INVALID_XML,
              is_keyframe: true,
            },
          ]),
        } as unknown as StorageAdapter;
      }
    });

    // 模拟 DrawIO merge 错误事件
    mockAddEventListener.mockImplementation((event, handler) => {
      if (event === "drawio-merge-error") {
        setTimeout(() => {
          handler({
            detail: {
              error: "merge_failed",
              requestId: "test-request-id",
            },
          });
        }, 10);
      }
    });

    const result = await replaceDrawioXML(INVALID_XML);

    expect(result.success).toBe(false);
    expect(result.error).toBe("drawio_syntax_error");
    expect(result.message).toBe(
      "DrawIO 报告 XML 语法错误，但回滚失败（未能捕获快照），数据可能已损坏，请检查项目状态",
    );
  });

  it("场景 3：回滚失败 - 写入失败（存储不可用）", async () => {
    const { getStorage } = await import("../storage/storage-factory");
    const { resolveCurrentProjectUuid } = await import(
      "../storage/current-project"
    );
    const { materializeVersionXml } = await import(
      "../storage/xml-version-engine"
    );

    // 创建单个 mock 实例，使用 mockResolvedValueOnce 和 mockRejectedValueOnce
    const sharedMockStorage = {
      getProject: vi
        .fn()
        .mockResolvedValue({ id: "project-1", name: "Test Project" }),
      getXMLVersionsByProject: vi.fn().mockResolvedValue([
        {
          id: "version-1",
          semantic_version: WIP_VERSION,
          xml_content: VALID_XML,
          is_keyframe: true,
        },
      ]),
      getXMLVersion: vi.fn(),
      updateXMLVersion: vi
        .fn()
        .mockResolvedValueOnce(undefined) // 第一次调用成功
        .mockRejectedValueOnce(new Error("Storage unavailable")), // 第二次调用失败
      createXMLVersion: vi.fn(),
    };

    // 确保每次调用 getStorage 都返回同一个 mock 实例
    vi.mocked(getStorage).mockResolvedValue(
      sharedMockStorage as unknown as StorageAdapter,
    );
    vi.mocked(resolveCurrentProjectUuid).mockResolvedValue("project-1");
    vi.mocked(materializeVersionXml).mockResolvedValue(VALID_XML);

    // 模拟 DrawIO merge 错误事件
    mockAddEventListener.mockImplementation((event, handler) => {
      if (event === "drawio-merge-error") {
        setTimeout(() => {
          handler({
            detail: {
              error: "merge_failed",
              requestId: "test-request-id",
            },
          });
        }, 10);
      }
    });

    const result = await replaceDrawioXML(INVALID_XML);

    expect(result.success).toBe(false);
    expect(result.error).toBe("drawio_syntax_error");
    expect(result.message).toBe(
      "DrawIO 报告 XML 语法错误，但回滚失败（存储不可用），数据可能已损坏，请检查项目状态",
    );
  });
});

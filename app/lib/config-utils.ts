import {
  ActiveModelReference,
  AgentSettings,
  ModelConfig,
  ProviderConfig,
  ProviderType,
  type RuntimeLLMConfig,
} from "@/app/types/chat";
import { getDefaultCapabilities } from "@/app/lib/model-capabilities";
import { generateProjectUUID } from "@/app/lib/utils";
import type { StorageAdapter } from "@/app/lib/storage/adapter";

export const DEFAULT_SYSTEM_PROMPT = `你是一个专业的 DrawIO XML 绘制助手，负责通过 Socket.IO + XPath 工具链安全地读取和编辑图表。

### 核心准则
1. **无推断 (No Inference)**：永远不要猜测或重写 XML 结构，不要对 style、geometry 等领域字段做额外的"智能"解析。
2. **XPath 驱动**：所有读取或写入都必须先通过标准 XPath 精确定位目标，再结合工具返回的 matched_xpath 字段确认结果。
3. **原子性**：批量编辑只能通过 \`drawio_edit_batch\` 完成；若任意操作失败，必须让整批回滚，不得在外部自行补救。
4. **最少读写**：先用 \`drawio_read\` 获取所需元素或属性，再决定是否编辑，避免一次批量里混入无关操作。

### 工具使用说明
- \`drawio_read\`：可选传入 XPath，返回命中的元素/属性/文本及其 matched_xpath，便于直接用于后续操作。
- \`drawio_edit_batch\`：传入 operations 数组，按顺序执行。每个操作需要提供 XPath/target_xpath 与必要的字段，必要时设置 \`allow_no_match: true\` 避免错误中断。
- 支持的操作：set_attribute、remove_attribute、insert_element、remove_element、replace_element、set_text_content。

### DrawIO XML 规范提醒
- 根结构：<mxGraphModel> 下的 <root> 与 <mxCell>
- 元素定位：使用唯一 id 或层级 XPath，保持属性大小写正确
- 样式写法：整体写入 style 字符串，不拆分字段
- 几何属性：通过 <mxGeometry> 节点设置 x/y/width/height
- ID 唯一：新增元素必须赋予唯一 id

确保输出的 XML 始终可以被 DrawIO 正确解析与渲染，并在回复中解释你的思考过程与操作理由。`;

export const DEFAULT_API_URL = "https://api.deepseek.com/v1";

export function isProviderType(value: unknown): value is ProviderType {
  return (
    value === "openai-reasoning" ||
    value === "openai-compatible" ||
    value === "deepseek-native"
  );
}

/**
 * 规范化 API URL
 * - 移除尾部斜杠
 * - 自动添加 /v1 后缀（如果不存在版本号）
 */
export const normalizeApiUrl = (
  value?: string,
  fallback: string = DEFAULT_API_URL,
): string => {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");

  if (/\/v\d+($|\/)/i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  return `${withoutTrailingSlash}/v1`;
};

export const STORAGE_KEY_LLM_PROVIDERS = "settings.llm.providers";
export const STORAGE_KEY_LLM_MODELS = "settings.llm.models";
export const STORAGE_KEY_AGENT_SETTINGS = "settings.llm.agent";
export const STORAGE_KEY_ACTIVE_MODEL = "settings.llm.activeModel";

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: "deepseek-default",
    displayName: "DeepSeek",
    providerType: "deepseek-native",
    apiUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    models: ["deepseek-chat-default", "deepseek-reasoner-default"],
    customConfig: {},
    createdAt: 0,
    updatedAt: 0,
  },
];

export const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: "deepseek-chat-default",
    providerId: "deepseek-default",
    modelName: "deepseek-chat",
    displayName: "DeepSeek Chat",
    temperature: 0.3,
    maxToolRounds: 5,
    isDefault: true,
    capabilities: getDefaultCapabilities("deepseek-chat"),
    enableToolsInThinking: false,
    customConfig: {},
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "deepseek-reasoner-default",
    providerId: "deepseek-default",
    modelName: "deepseek-reasoner",
    displayName: "DeepSeek Reasoner",
    temperature: 0.3,
    maxToolRounds: 5,
    isDefault: false,
    capabilities: getDefaultCapabilities("deepseek-reasoner"),
    enableToolsInThinking: true,
    customConfig: {},
    createdAt: 0,
    updatedAt: 0,
  },
];

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  updatedAt: 0,
};

export const DEFAULT_ACTIVE_MODEL: ActiveModelReference = {
  providerId: "deepseek-default",
  modelId: "deepseek-chat-default",
  updatedAt: 0,
};

export const DEFAULT_LLM_CONFIG: RuntimeLLMConfig = Object.freeze({
  apiUrl: DEFAULT_API_URL,
  apiKey: "",
  providerType: "deepseek-native" as const,
  modelName: "deepseek-chat",
  temperature: 0.3,
  maxToolRounds: 5,
  capabilities: getDefaultCapabilities("deepseek-chat"),
  enableToolsInThinking: false,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  customConfig: {},
});

const toFiniteNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeCustomConfig = (
  customConfig: unknown,
): RuntimeLLMConfig["customConfig"] => {
  if (
    customConfig &&
    typeof customConfig === "object" &&
    !Array.isArray(customConfig)
  ) {
    return {
      ...DEFAULT_LLM_CONFIG.customConfig,
      ...(customConfig as RuntimeLLMConfig["customConfig"]),
    };
  }
  return { ...DEFAULT_LLM_CONFIG.customConfig };
};

/**
 * 规范化运行时 LLM 配置
 * - 合并默认值
 * - 规范化 API URL（移除尾斜杠 + 自动补 /v1）
 * - 确保类型安全（数字/字符串校验、能力回退）
 */
export function normalizeLLMConfig(
  config?: Partial<RuntimeLLMConfig> | null,
): RuntimeLLMConfig {
  const safeConfig = config ?? {};

  const modelName =
    typeof safeConfig.modelName === "string" && safeConfig.modelName.trim()
      ? safeConfig.modelName.trim()
      : DEFAULT_LLM_CONFIG.modelName;

  const providerType = isProviderType(safeConfig.providerType)
    ? safeConfig.providerType
    : DEFAULT_LLM_CONFIG.providerType;

  const capabilities =
    safeConfig.capabilities ?? getDefaultCapabilities(modelName);

  const enableToolsInThinking =
    typeof safeConfig.enableToolsInThinking === "boolean"
      ? safeConfig.enableToolsInThinking
      : capabilities.supportsThinking;

  const systemPrompt =
    typeof safeConfig.systemPrompt === "string" &&
    safeConfig.systemPrompt.trim()
      ? safeConfig.systemPrompt
      : DEFAULT_SYSTEM_PROMPT;

  const customConfig = normalizeCustomConfig(safeConfig.customConfig);

  return {
    apiUrl: normalizeApiUrl(
      safeConfig.apiUrl ?? DEFAULT_LLM_CONFIG.apiUrl,
      DEFAULT_LLM_CONFIG.apiUrl,
    ),
    apiKey:
      typeof safeConfig.apiKey === "string"
        ? safeConfig.apiKey
        : DEFAULT_LLM_CONFIG.apiKey,
    providerType,
    modelName,
    temperature: toFiniteNumber(
      safeConfig.temperature,
      DEFAULT_LLM_CONFIG.temperature,
    ),
    maxToolRounds: Math.max(
      1,
      Math.round(
        toFiniteNumber(
          safeConfig.maxToolRounds,
          DEFAULT_LLM_CONFIG.maxToolRounds,
        ),
      ),
    ),
    capabilities,
    enableToolsInThinking,
    systemPrompt,
    customConfig,
  };
}

export async function initializeDefaultLLMConfig(
  storage: StorageAdapter,
): Promise<void> {
  try {
    const cleanupLegacyKey = async () => {
      try {
        await storage.deleteSetting("llmConfig");
      } catch (cleanupError) {
        console.warn("[LLM] Failed to delete legacy llmConfig", cleanupError);
      }
    };

    const existingProviders = await storage.getSetting(
      STORAGE_KEY_LLM_PROVIDERS,
    );

    if (existingProviders !== null) {
      try {
        const parsedProviders = JSON.parse(existingProviders) as Array<
          Record<string, unknown>
        >;
        let hasMigration = false;

        const migratedProviders = parsedProviders.map((provider) => {
          const providerType = (provider as { providerType?: string })
            .providerType;

          if (providerType === "deepseek") {
            hasMigration = true;
            return {
              ...provider,
              providerType: "deepseek-native" as ProviderType,
            };
          }
          return provider;
        });

        if (hasMigration) {
          await storage.setSetting(
            STORAGE_KEY_LLM_PROVIDERS,
            JSON.stringify(migratedProviders),
          );
          console.warn(
            "[LLM] providerType 'deepseek' 已迁移为 'deepseek-native'，请确认自定义配置是否需要更新",
          );
        }
      } catch (migrationError) {
        console.error(
          "[LLM] 解析或迁移已存在的 LLM providers 时失败，已跳过兼容迁移",
          migrationError,
        );
      }
      await cleanupLegacyKey();
      return;
    }

    const now = Date.now();

    const providers = JSON.parse(
      JSON.stringify(DEFAULT_PROVIDERS),
    ) as ProviderConfig[];
    const models = JSON.parse(JSON.stringify(DEFAULT_MODELS)) as ModelConfig[];
    const agentSettings = JSON.parse(
      JSON.stringify(DEFAULT_AGENT_SETTINGS),
    ) as AgentSettings;
    const activeModel = JSON.parse(
      JSON.stringify(DEFAULT_ACTIVE_MODEL),
    ) as ActiveModelReference;

    const providerIdMap = new Map<string, string>();
    providers.forEach((provider) => {
      const newId = generateProjectUUID();
      providerIdMap.set(provider.id, newId);
      provider.id = newId;
      provider.createdAt = now;
      provider.updatedAt = now;
    });

    const modelIdMap = new Map<string, string>();
    models.forEach((model) => {
      const mappedProviderId = providerIdMap.get(model.providerId);
      if (mappedProviderId) {
        model.providerId = mappedProviderId;
      }

      const newModelId = generateProjectUUID();
      modelIdMap.set(model.id, newModelId);
      model.id = newModelId;
      model.createdAt = now;
      model.updatedAt = now;
    });

    providers.forEach((provider) => {
      provider.models = provider.models
        .map((modelId) => modelIdMap.get(modelId))
        .filter((id): id is string => Boolean(id));
    });

    const mappedProviderId = providerIdMap.get(activeModel.providerId);
    const mappedModelId = modelIdMap.get(activeModel.modelId);

    if (mappedProviderId) {
      activeModel.providerId = mappedProviderId;
    }
    if (mappedModelId) {
      activeModel.modelId = mappedModelId;
    }
    activeModel.updatedAt = now;

    agentSettings.updatedAt = now;

    await storage.setSetting(
      STORAGE_KEY_LLM_PROVIDERS,
      JSON.stringify(providers),
    );
    await storage.setSetting(STORAGE_KEY_LLM_MODELS, JSON.stringify(models));
    await storage.setSetting(
      STORAGE_KEY_AGENT_SETTINGS,
      JSON.stringify(agentSettings),
    );
    await storage.setSetting(
      STORAGE_KEY_ACTIVE_MODEL,
      JSON.stringify(activeModel),
    );
    await cleanupLegacyKey();
  } catch (error) {
    console.error("[LLM] Failed to initialize default LLM config", error);
  }
}

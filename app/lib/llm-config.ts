import { LLMConfig, ProviderType } from "@/app/types/chat";

export const DEFAULT_SYSTEM_PROMPT = `你是一个专业的 DrawIO XML 绘制助手，负责通过 Socket.IO + XPath 工具链安全地读取和编辑图表。

### 核心准则
1. **无推断 (No Inference)**：永远不要猜测或重写 XML 结构，不要对 style、geometry 等领域字段做额外的“智能”解析。
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

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  apiUrl: DEFAULT_API_URL,
  apiKey: "",
  temperature: 0.3,
  modelName: "deepseek-chat",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  providerType: "deepseek",
  maxToolRounds: 5,
};

const PROVIDER_TYPES: ProviderType[] = ["openai-reasoning", "openai-compatible", "deepseek"];

export const isProviderType = (value: unknown): value is ProviderType =>
  typeof value === "string" && PROVIDER_TYPES.includes(value as ProviderType);

export const resolveProviderType = (
  providerType?: unknown,
  legacyFlag?: unknown
): ProviderType => {
  if (isProviderType(providerType)) {
    return providerType;
  }

  // 向后兼容：将旧的 provider 类型映射到新类型
  if (typeof providerType === "string") {
    if (providerType === "openai" || providerType === "openai-response") {
      return "openai-compatible";
    }
    if (providerType === "anthropic") {
      return "openai-compatible";
    }
  }

  // 兼容旧的 legacyFlag
  if (legacyFlag === true) {
    return "openai-compatible";
  }

  // 默认使用 openai-compatible
  return "openai-compatible";
};

export const normalizeApiUrl = (value?: string, fallback: string = DEFAULT_API_URL): string => {
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

export const normalizeLLMConfig = (
  value?: Partial<LLMConfig> & { useLegacyOpenAIFormat?: boolean }
): LLMConfig => {
  const providerType = resolveProviderType(value?.providerType, value?.useLegacyOpenAIFormat);

  return {
    apiUrl: normalizeApiUrl(value?.apiUrl),
    apiKey: typeof value?.apiKey === "string" ? value.apiKey : DEFAULT_LLM_CONFIG.apiKey,
    temperature:
      typeof value?.temperature === "number" && Number.isFinite(value.temperature)
        ? value.temperature
        : DEFAULT_LLM_CONFIG.temperature,
    modelName:
      typeof value?.modelName === "string" && value.modelName.trim()
        ? value.modelName
        : DEFAULT_LLM_CONFIG.modelName,
    systemPrompt:
      typeof value?.systemPrompt === "string"
        ? value.systemPrompt
        : DEFAULT_LLM_CONFIG.systemPrompt,
    providerType,
    maxToolRounds:
      typeof value?.maxToolRounds === "number" && Number.isFinite(value.maxToolRounds)
        ? value.maxToolRounds
        : DEFAULT_LLM_CONFIG.maxToolRounds,
  };
};

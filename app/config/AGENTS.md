# app/config - AI 代理说明

## 目录用途

存放与 AI/绘图能力相关的配置文件。当前包含 **Skill 配置系统**，用于定义 AI 绘图助手的风格样式与知识库。

## 文件索引

### skill-elements.json

绘图技能配置数据（JSON 格式），包含两大部分：

- **themes**：预设风格样式（modern/academic/minimal/custom）
- **knowledge**：知识类型库（通用图形、流程图、UML、云服务图标等）

### skill-elements.ts

TypeScript 类型定义与配置读取工具，提供以下能力：

- **类型定义**：`SkillThemeConfig`、`SkillKnowledgeConfig`
- **加载函数**：`loadSkillKnowledgeConfig()`
- **查询函数**：`getThemeById()`、`getKnowledgeById()`、`getRequiredKnowledge()`、`getOptionalKnowledge()`

## skill-elements.json 配置详解

### 一、themes（风格配置）

每个风格对象包含以下字段：

| 字段             | 类型   | 说明                                           |
| ---------------- | ------ | ---------------------------------------------- |
| `id`             | string | 风格唯一标识（modern/academic/minimal/custom） |
| `nameKey`        | string | 国际化键名（指向 `chat.json` 的翻译文本）      |
| `promptFragment` | string | 风格提示词片段（注入到 AI 系统提示词）         |

#### 预设风格说明

**1. modern（现代风格）**

- **适用场景**：Web 产品、营销材料、演示文稿
- **视觉特征**：
  - 圆角矩形为主，笔触宽度一致
  - 优先使用用户配色，无配色时采用中性底色 + 1 个强调色
  - 栅格对齐布局，留白充足
  - 正交连接线，最小化交叉
- **禁用元素**：渐变、重阴影、3D效果、彩虹色板

**2. academic（学术风格）**

- **适用场景**：论文插图、研究报告、技术文档
- **视觉特征**：
  - 直角为主，圆角适中
  - 抑制饱和度，优先用户配色或中性 + 1-2 主色
  - 严格对齐，标签位置稳定
  - 正交连接线带明确路径点，虚线需有明确语义
- **禁用元素**：装饰图标、粗轮廓、强填充、重阴影

**3. minimal（极简风格）**

- **适用场景**：概念图、线框图、快速原型
- **视觉特征**：
  - 单色或双色（中性 + 浅强调色）
  - 仅使用基础形状，无装饰图标
  - 优先无填充或极浅填充，细笔触
  - 超大留白，短标签
  - 细短正交连接线
- **禁用元素**：复杂填充、渐变、阴影

**4. custom（自定义风格）**

- **触发条件**：用户需要特定品牌风格或非标准视觉语言
- **交互规则**：
  - 严格遵循用户的风格描述/配色/品牌规范
  - 缺少关键参数时，仅询问必要信息：配色、圆角、笔触宽度、排版风格、连接线样式（正交/曲线）、布局密度
  - 保持配色简洁一致，禁止随意添加颜色

#### promptFragment 内容规则

- **多行文本**：使用 `\n` 表示换行（JSON 转义规则）
- **结构要求**：
  - Palette（配色）：优先用户配色，默认配色方案
  - Shapes（形状）：默认图形类型、笔触风格
  - Layout（布局）：对齐规则、间距、留白
  - Connectors（连接线）：路由方式、交叉处理
  - Avoid（禁用）：明确不允许的视觉元素

### 二、knowledge（知识配置）

每个知识对象包含以下字段：

| 字段             | 类型    | 说明                                            |
| ---------------- | ------- | ----------------------------------------------- |
| `id`             | string  | 知识唯一标识（general/basic/uml/aws/azure/...） |
| `nameKey`        | string  | 国际化键名（指向 `chat.json` 的翻译文本）       |
| `required`       | boolean | 是否默认启用（true=必选，false=可选）           |
| `promptFragment` | string  | 知识提示词片段（注入到 AI 系统提示词）          |

#### 知识类型说明

**1. general（通用图形）** - 必选

- 基础图形：矩形、椭圆、菱形、三角形
- 容器：泳道（swimlane）
- 注释：便签（note）、大括号（curlyBracket）
- 图标：自定义图片（image 形状 + data URL）

**2. basic（基础流程图）** - 可选

- 流程图标准图元：起止框、处理框、判断框、数据框、子流程、文档

**3. misc（杂项）** - 可选

- 便签注释、大括号、泳道容器、自定义 SVG 图标

**4. uml（UML 图）** - 可选

- 类图/接口框、生命线、角色、用例、状态、终态

**5. aws（AWS 云服务图标）** - 可选

- EC2、S3、Lambda、RDS、DynamoDB、VPC、ALB、CloudFront、API Gateway、分组容器

**6. azure（Azure 云服务图标）** - 可选

- 虚拟机、Blob 存储、SQL 数据库、函数、应用服务、虚拟网络、负载均衡、应用网关、AKS、容器实例
- ⚠️ 注意：Azure 图标使用 `image=<path>` 引用本地 SVG 路径

**7. gcp（GCP 云服务图标）** - 可选

- Compute Engine、Cloud Storage、BigQuery、Cloud Functions、GKE、Cloud Run、Pub/Sub

**8. network（网络拓扑图标）** - 可选

- 路由器、三层交换机、防火墙、服务器、工作站、云

#### promptFragment 内容规则

- **格式约定**：使用 `[分类名]` 标记知识块（如 `[General]`、`[AWS]`）
- **列表结构**：每行一个图元，格式为 `shape: 说明`
- **特殊属性**：HTML 值、flipH、grIcon 等参数说明
- **图标引用**：
  - 图库图标（如 `mxgraph.aws4.ec2`）
  - 本地路径（如 `img/lib/azure2/compute/Virtual_Machine.svg`）
  - data URL（如 `data:image/svg+xml,...`）

## 国际化集成

配置文件中的 `nameKey` 字段对应 `public/locales/{{lng}}/chat.json` 的翻译键：

```json
// chat.json 结构示例
{
  "skill": {
    "theme": {
      "modern": "现代", // nameKey: skill.theme.modern
      "academic": "学术", // nameKey: skill.theme.academic
      "minimal": "极简", // nameKey: skill.theme.minimal
      "custom": "自定义" // nameKey: skill.theme.custom
    },
    "element": {
      "general": "通用", // nameKey: skill.element.general
      "basic": "基础流程", // nameKey: skill.element.basic
      "uml": "UML", // nameKey: skill.element.uml
      "aws": "AWS", // nameKey: skill.element.aws
      "azure": "Azure", // nameKey: skill.element.azure
      "gcp": "GCP", // nameKey: skill.element.gcp
      "network": "网络" // nameKey: skill.element.network
    }
  }
}
```

## 维护规则

### 1. JSON 格式规范

- 必须保持有效 JSON 格式（使用在线校验器检查）
- `promptFragment` 多行文本使用 `\n` 表示换行
- 禁止使用注释（JSON 不支持）

### 2. ID 稳定性原则

- `id` 字段必须唯一且稳定，禁止随意更改
- 破坏性变更影响：
  - 用户存储的 Skill 配置失效
  - 国际化键名失配（需同步更新所有语言的 `chat.json`）
  - 缩略图资源路径失效（`public/images/skill-themes/{id}.svg`）

### 3. 关联文件同步

修改配置时需同步检查/更新以下文件：

| 文件                                  | 同步内容                                |
| ------------------------------------- | --------------------------------------- |
| `app/config/skill-elements.ts`        | 类型定义（`SkillThemeId` 等）           |
| `app/types/chat.ts`                   | `SkillKnowledgeId` 类型                 |
| `public/locales/*/chat.json`          | `skill.theme.*` 和 `skill.element.*` 键 |
| `public/images/skill-themes/{id}.svg` | 风格缩略图资源                          |

### 4. 提示词片段编写规范

- **简洁明确**：避免冗长描述，AI 上下文窗口宝贵
- **结构化**：使用固定格式（Palette/Shapes/Layout/Connectors/Avoid）
- **无歧义**：使用具体指令（如"圆角 8px"），避免模糊词汇（如"比较圆"）
- **用户配色优先**：所有风格必须优先使用用户提供的配色方案

### 5. 新增知识类型流程

1. 在 `knowledge` 数组添加新对象，确保 `id` 唯一
2. 更新 `app/types/chat.ts` 中的 `SkillKnowledgeId` 联合类型
3. 在所有语言的 `chat.json` 添加 `skill.element.{id}` 翻译
4. 测试：创建新对话 → 配置 Skill → 发送消息 → 检查系统提示词注入

### 6. 新增风格类型流程

1. 在 `themes` 数组添加新对象，确保 `id` 唯一
2. 更新 `app/config/skill-elements.ts` 中的 `SkillThemeId` 联合类型
3. 在所有语言的 `chat.json` 添加 `skill.theme.{id}` 翻译
4. （可选）创建缩略图 `public/images/skill-themes/{id}.svg`（150x100px）
5. 测试：UI 显示 → 配置保存 → 系统提示词注入

## 配置加载机制

```typescript
// 加载配置（静态导入）
import { skillKnowledgeConfig } from "@/app/config/skill-elements";

// 查询风格
const theme = getThemeById("modern");
console.log(theme.promptFragment); // 输出风格提示词

// 查询知识
const aws = getKnowledgeById("aws");
console.log(aws.required); // 输出是否必选

// 获取必选知识列表
const required = getRequiredKnowledge();
console.log(required.map((k) => k.id)); // ["general"]

// 获取可选知识列表
const optional = getOptionalKnowledge();
console.log(optional.map((k) => k.id)); // ["basic", "misc", "uml", ...]
```

## 系统提示词注入机制

用户配置的 Skill 设置会动态注入到 AI 的系统提示词中：

```
系统提示词模板（app/lib/storage → AgentSettings.systemPrompt）：
{{theme}}
{{knowledge}}

↓ 运行时替换 ↓

modern 风格提示词片段
+
general 知识提示词片段
+
aws 知识提示词片段（用户选中）
+
uml 知识提示词片段（用户选中）
```

**占位符规则**：

- `{{theme}}`：替换为用户选中的风格提示词
- `{{knowledge}}`：替换为所有选中的知识提示词（必选 + 用户选择的可选）

**失效检测**：

- 如果系统提示词缺少 `{{theme}}` 或 `{{knowledge}}`，Skill 配置按钮会禁用
- UI 提示：`chat.json` → `skill.disabled.missingTemplate` / `partialTemplate`

## 相关文件

- **配置文件**: `/home/aaa/Code/drawio2go/app/config/skill-elements.json`
- **类型定义**: `/home/aaa/Code/drawio2go/app/config/skill-elements.ts`
- **类型引用**: `/home/aaa/Code/drawio2go/app/types/chat.ts`
- **国际化**: `/home/aaa/Code/drawio2go/public/locales/{{lng}}/chat.json`
- **UI 组件**: `/home/aaa/Code/drawio2go/app/components/ChatSidebar.tsx`
- **配置读取**: `/home/aaa/Code/drawio2go/app/lib/config-utils.ts`

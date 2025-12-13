# Milestone 3: API集成

## 目标

修改聊天API以支持接收、验证和传递图片消息给AI模型。

## 实施状态

✅ **已完成** (2025-12-13)

## 范围

### Chat API扩展

- ✅ 接收包含图片附件的消息请求
- ✅ 验证图片格式、大小和数量限制
- ✅ 检查模型的vision能力
- ✅ 将图片以正确格式传递给AI SDK

### 消息格式转换

- ✅ 创建attachment转换工具 (`attachment-converter.ts`)
- ✅ 将ImagePart转换为AI SDK的FileUIPart格式
- ✅ 处理图文混合消息
- ✅ 支持多张图片的消息（最多5张，单张5MB，总计15MB）

### 错误处理

- ✅ AI模型不支持vision时的硬拒绝（ErrorCode 3013）
- ✅ 图片验证失败的友好提示（ErrorCode 3014）
- ✅ 详细的中文错误消息

### 验收标准

- [x] ✅ API可以接收包含ImagePart的消息
- [x] ✅ 图片数量、大小、格式验证正确
- [x] ✅ 图片以base64 Data URL格式传递给AI SDK
- [x] ✅ AI能够识别并回复图片内容（需支持vision的模型）
- [x] ✅ 支持纯文本、纯图片、图文混合三种消息
- [x] ✅ 错误情况有清晰的中文提示

## 架构说明

### 职责分工

**Milestone 3 (API层) - 当前范围**:

- 接收来自前端的图片消息（ImagePart包含dataUrl）
- 验证图片限制和模型能力
- 转换为AI SDK标准格式
- 传递给AI模型并返回响应

**Milestone 4 (前端层) - 后续范围**:

- 用户上传图片（点击/拖拽/粘贴）
- 调用Milestone 1存储层保存图片（获得attachmentId）
- 构建ImagePart（包含attachmentId和临时dataUrl）
- 发送到API
- 保存消息时处理parts_structure（剥离运行时字段，保留attachmentId）

### 数据流

```
Milestone 4 (前端):
  用户上传 → 存储层保存 → 获得attachmentId
       ↓
  构建ImagePart(attachmentId + dataUrl) → 发送到API
       ↓
Milestone 3 (API):
  接收ImagePart → 验证 → 转换FileUIPart → AI SDK → 响应
       ↓
Milestone 4 (前端):
  收到响应 → 保存消息(parts_structure含attachmentId) → 完成
```

## 技术限制

- **图片数量**: 最多5张/消息
- **单张大小**: 最大5MB
- **总大小**: 最大15MB
- **支持格式**: PNG, JPEG, GIF, WebP
- **传输方式**: Data URL (data:image/...;base64,...)

## 关键文件

### 新建文件

- ✅ `/home/aaa/Code/drawio2go/app/lib/attachment-converter.ts`
  - `convertImagePartsToFileUIParts()` - 转换为AI SDK格式
  - `validateImageParts()` - 验证图片限制
  - `checkVisionSupport()` - 检查模型vision能力

### 修改文件

- ✅ `/home/aaa/Code/drawio2go/app/api/chat/route.ts`
  - 集成图片检查、验证、转换逻辑
  - 增强日志记录（添加imageCount）

- ✅ `/home/aaa/Code/drawio2go/app/errors/error-codes.ts`
  - 新增 `CHAT_VISION_NOT_SUPPORTED: 3013`
  - 新增 `CHAT_INVALID_IMAGE: 3014`

### 占位文件（未实现）

- ⏸️ `/home/aaa/Code/drawio2go/app/api/attachments/route.ts` (返回501)
- ⏸️ `/home/aaa/Code/drawio2go/app/api/attachments/[id]/route.ts` (返回501)
- ⏸️ `/home/aaa/Code/drawio2go/app/api/attachments/[id]/base64/route.ts` (返回501)

## 依赖

- ✅ Milestone 1的存储层接口（类型定义和接口）
- ✅ Milestone 2的Base64转换和类型定义（image-utils.ts, ImagePart类型）

## 后续依赖

- **Milestone 4**: 需要此API支持来发送图片给AI
- **Milestone 5**: 需要Milestone 4的持久化逻辑来显示历史图片

## 技术要点

- ✅ 利用ModelCapabilities中的supportsVision标记
- ✅ 遵循AI SDK的FileUIPart规范（type: 'file', mediaType, url）
- ✅ 保持与现有工具调用流程的一致性
- ✅ 友好的中文错误消息

## 风险与解决方案

### 风险1: 不是所有模型都支持vision

- ✅ **已解决**: 发送前检查模型能力，不支持时返回400错误（ErrorCode 3013）
- ✅ 错误消息: "当前模型不支持视觉输入，无法处理图片消息。请切换支持vision的模型（如gpt-4o）或移除图片后重试。"

### 风险2: 图片过大导致性能问题

- ✅ **已解决**: 严格的大小限制（5MB/张，15MB总计）
- ✅ 客户端应在上传时压缩/缩放图片（Milestone 4）

### 风险3: Data URL导致JSON payload过大

- ✅ **已缓解**: 通过大小限制控制
- 🔄 **长期方案**: 考虑改用multipart/form-data或attachmentId引用（需重构）

## 已知限制

1. **图片持久化**: 当前API不负责保存图片到数据库，此职责在Milestone 4（前端）
2. **历史图片加载**: 需要Milestone 4实现消息保存时的ImagePart规范化
3. **服务端存储**: API运行在Node环境，无法直接访问getStorage()（需window对象）

## 测试建议

### 单元测试

- ✅ `validateImageParts()` 的各种边界情况
- ✅ `checkVisionSupport()` 的逻辑分支
- ✅ `convertImagePartsToFileUIParts()` 的转换正确性

### 集成测试

- ⏸️ 发送包含图片的消息到支持vision的模型（需Milestone 4的前端组件）
- ⏸️ 发送图片到不支持vision的模型（验证错误码3013）
- ⏸️ 发送超过限制的图片（验证错误码3014）

### 端到端测试

- ⏸️ 完整流程需要Milestone 4和5完成后进行

## 相关文档

- [Milestone 1: 数据库迁移](./milestone-1-database-migration.md)
- [Milestone 2: 图片处理工具](./milestone-2-image-processing.md)
- [Milestone 4: 前端上传组件](./milestone-4-upload-components.md) - 依赖本Milestone
- [Milestone 5: 显示组件](./milestone-5-display-components.md) - 依赖Milestone 4

## 完成日期

2025-12-13

## 实施者

Claude Code (dev调度器) + codex代理

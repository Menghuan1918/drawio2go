# 工具库

## 概述

汇总应用层工具函数与 AI 工具定义，负责 DrawIO XML 的读取、写入与 Socket.IO 调用协调。

## 工具文件清单

- **drawio-tools.ts**: 浏览器端的 XML 存储桥接（localStorage + 事件通知）
- **drawio-xml-service.ts**: 服务端 XML 转接层，负责 XPath 查询与批量编辑
- **drawio-ai-tools.ts**: AI 工具定义（`drawio_read` / `drawio_edit_batch`）
- **tool-executor.ts**: 工具执行路由器，通过 Socket.IO 与前端通讯
- ~~llm-config.ts~~: LLM 配置工具（已迁移到 hooks）

## DrawIO Socket.IO 调用流程

1. 后端工具通过 `executeToolOnClient()` 获取当前 XML 或请求前端写入
2. 前端（`useDrawioSocket` + `drawio-tools.ts`）访问 localStorage 并响应请求
3. 服务端使用 `drawio-xml-service.ts` 对 XML 进行 XPath 查询或批量操作
4. 编辑完成后再次通过 Socket.IO 将新 XML 写回前端

## DrawIO XML 转接层（`drawio-xml-service.ts`）

### 核心设计原则
- **无推断 (No Inference)**: 不对 XML 做领域特化解析，只处理调用者提供的 XPath 与原始字符串
- **XPath 驱动**: 所有查询与编辑均使用标准 XPath 表达式定位节点
- **原子性**: `drawio_edit_batch` 全部成功后才写回前端，任一操作失败立即返回错误，不修改原始 XML
- **Base64 解码**: 每次从前端读取 XML 后都会自动检测并解码 `data:image/svg+xml;base64,` 前缀

### 提供的函数
- `executeDrawioRead(xpath?: string)`: 返回结构化的查询结果（元素 / 属性 / 文本），并在 `matched_xpath` 字段中携带命中路径
- `executeDrawioEditBatch({ operations })`: 执行批量操作，遵守 `allow_no_match` 语义并保持原子性

### 支持的操作类型
`set_attribute`, `remove_attribute`, `insert_element`, `remove_element`, `replace_element`, `set_text_content`

## DrawIO AI 工具（`drawio-ai-tools.ts`）

- **`drawio_read`**: 可选 `xpath` 参数，默认返回根节点。输出为结构化 JSON 数组
- **`drawio_edit_batch`**: `operations` 数组，严格遵循“全部成功或全部失败”规则
- 输入参数使用 Zod 校验并在内部调用 `drawio-xml-service.ts`

## 工具执行路由器（`tool-executor.ts`）

- 统一管理 Socket.IO 请求的发送与结果回传
- 自动生成 `requestId`、处理超时与错误
- 当前仅路由 DrawIO 相关工具（前端执行部分）

## 浏览器端存储工具（`drawio-tools.ts`）

- localStorage 键名：`currentDiagram`
- 保存时自动解码 base64，并通过 `drawio-xml-updated` 自定义事件通知编辑器
- 提供 `getDrawioXML()`、`replaceDrawioXML()`、`saveDrawioXML()` 三个接口

## 类型定义

所有公共类型位于 `../types/drawio-tools.ts`，包含：
- 前端桥接返回结果（`GetXMLResult` / `ReplaceXMLResult` / `XMLValidationResult`）
- `drawio_read` 查询结果结构
- `drawio_edit_batch` 支持的操作及返回值

AI 聊天工具调用前自动创建版本 - 实施计划

📋 需求总结

- 触发范围: 仅 drawio_edit_batch 和 drawio_overwrite 两个工具
- 执行方式: 阻塞式版本创建（使用 await）
- 失败策略: 仅记录错误日志，不中断 AI 工具执行
- 版本描述: 工具名 + AI提供的描述 + 时间戳（AI 工具需添加 description 入参）
- 用户控制: 设置侧边栏添加开关，默认启用
- 超时补偿: 增加写入工具超时从 30 秒到 60 秒

---

🔧 实施步骤

阶段 1: 工具协议扩展

1.1 修改 AI 工具定义 (app/lib/drawio-ai-tools.ts)

- 为 drawioEditBatchTool 和 drawioOverwriteTool 添加 description 参数
- 参数要求：AI 精简描述本次修改动作（如"添加3个矩形节点"）
- 将 description 通过 input 传递到 executeToolOnClient()

  1.2 更新 Socket.IO 协议类型 (app/types/socket-protocol.ts)

- ToolCallRequest.input 中添加 description?: string 字段
- 确保类型安全传递到前端

---

阶段 2: 版本创建拦截逻辑

2.1 修改 Socket.IO 监听器 (app/hooks/useDrawioSocket.ts)

- 导入版本管理 Hooks（useStorageXMLVersions, useCurrentProject）
- 导入版本工具（getNextSubVersion, isSubVersion）
- 在 tool:execute 监听器中添加拦截逻辑：
  - 精确匹配工具名: request.toolName === "replace_drawio_xml"
  - 读取设置开关状态（useStorageSettings 获取 autoVersionOnAIEdit）
  - 如果启用，执行版本创建：
    i. 查询最新主版本
    ii. 计算下一个子版本号（如 1.0.0 → 1.0.0.1）
    iii. 从 request.input.description 提取 AI 描述
    iv. 生成版本描述：${工具名} - ${description} (${时间戳})
    v. 调用 createHistoricalVersion()（阻塞式）
  - 失败处理：try-catch 包裹，仅输出错误日志
  - 注意: drawio_edit_batch 和 drawio_overwrite 最终都通过 replace_drawio_xml 执行

    2.2 传递编辑器 Ref (app/page.tsx)

- 修改 useDrawioSocket(editorRef) 接受参数
- 从主页面传递 editorRef 以支持实时 SVG 导出

  2.3 记录原始工具名 (app/lib/drawio-ai-tools.ts)

- 在调用 executeToolOnClient() 时，在 input 中添加 \_originalTool 字段
- 这样前端可以区分是哪个高级工具触发的（drawio_edit_batch vs drawio_overwrite）

---

阶段 3: 设置系统集成

3.1 添加设置项 (app/lib/storage/types.ts)

- AppSettings 接口添加 autoVersionOnAIEdit?: boolean 字段（默认 true）

  3.2 设置侧边栏 UI (app/components/SettingsSidebar.tsx)

- 添加 "AI 编辑自动版本" 开关（HeroUI Switch 组件）
- 位置：版本管理相关设置区域
- 描述文本："AI 批量编辑或覆写 XML 前自动创建子版本快照"

---

阶段 4: 超时配置增强

4.1 增加默认超时 (app/lib/tool-executor.ts)

- executeToolOnClient() 默认超时从 30000ms 改为 60000ms

  4.2 工具特定超时 (app/lib/drawio-ai-tools.ts)

- drawioEditBatchTool 和 drawioOverwriteTool 显式指定 60 秒超时

  4.3 XML 服务层超时 (app/lib/drawio-xml-service.ts)

- batchEditDrawioXML() 中的 executeToolOnClient() 调用显式传递 60000ms

---

阶段 5: 测试与优化

5.1 功能测试

- ✅ drawio_edit_batch 调用触发版本创建
- ✅ drawio_overwrite 调用触发版本创建
- ✅ drawio_read 调用不触发版本创建
- ✅ 子版本号正确递增（1.0.0.1 → 1.0.0.2）
- ✅ 版本描述包含工具名、AI描述和时间戳
- ✅ 设置开关生效（启用/禁用）
- ✅ 版本创建失败不中断工具执行

  5.2 性能验证

- ✅ 版本创建阻塞时间（目标 < 5 秒）
- ✅ SVG 导出失败降级正常
- ✅ 60 秒超时足够覆盖版本创建 + XML 修改

  5.3 边界情况

- ✅ 首次使用（无主版本）默认使用 1.0.0.1
- ✅ 连续多次 AI 编辑正确递增子版本号
- ✅ 编辑器未就绪时的降级处理

---

📂 涉及的文件清单

需要修改（7 个文件）:

1.  app/lib/drawio-ai-tools.ts - 添加 description 参数 + \_originalTool 标记
2.  app/types/socket-protocol.ts - 扩展 input 类型（可选，因为是 Record<string, unknown>）
3.  app/hooks/useDrawioSocket.ts - 核心拦截逻辑（仅匹配 replace_drawio_xml）
4.  app/page.tsx - 传递 editorRef
5.  app/lib/storage/types.ts - 添加设置字段
6.  app/components/SettingsSidebar.tsx - UI 开关
7.  app/lib/tool-executor.ts - 增加默认超时

可选优化（2 个文件）:

- app/lib/drawio-xml-service.ts - 显式超时配置
- 控制台日志优化（版本创建进度提示）

---

⚠ 关键技术点

1.  工具名映射:

- AI 调用：drawio_edit_batch / drawio_overwrite
- Socket.IO 传输：最终都转为 replace_drawio_xml
- 解决方案：在 input 中添加 \_originalTool 字段标识原始工具

2.  阻塞式执行: 使用 await createHistoricalVersion() 确保版本创建完成后再执行 XML 修改
3.  失败降级: try-catch 包裹版本创建，失败时记录日志但不抛出异常
4.  子版本策略: 自动基于最新主版本生成子版本（1.0.0.1, 1.0.0.2...）
5.  描述规范: ${originalTool} - ${aiDescription} (${timestamp})
6.  设置持久化: 使用统一存储层 useStorageSettings 管理开关状态

---

✅ 预期效果

完成后，AI 聊天中每次调用 drawio_edit_batch 或 drawio_overwrite 时：

1.  自动创建子版本快照（如 1.0.0.1）
2.  版本描述清晰记录操作内容（如 "drawio_edit_batch - 添加3个矩形 (2025-11-19 14:30)"）
3.  用户可在版本侧边栏随时回滚
4.  不影响 AI 响应速度（并行操作 + 降级策略）
5.  用户可通过设置控制是否启用此功能
6.  其他工具（如 drawio_read）不受影响

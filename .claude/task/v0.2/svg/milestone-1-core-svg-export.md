# 里程碑1：核心SVG导出功能

## 🎯 目标
实现 DrawioEditorNative 组件的 SVG 导出功能，为后续的版本保存和展示提供基础能力。

## 📝 涉及文件
- `app/components/DrawioEditorNative.tsx` - 扩展组件功能
- `app/lib/svg-export-utils.ts` - 新建工具库

## ✅ 任务清单

### 1. 扩展 DrawioEditorNative 组件
- [x] 在 `DrawioEditorRef` 接口中添加 `exportSVG()` 方法签名
- [x] 实现 `exportSVG()` 方法，使用 postMessage 与 DrawIO iframe 通信
  - 发送 `{ action: "export", format: "svg" }` 消息
  - 监听返回的 SVG 数据
  - 返回 Promise<string>
- [x] 添加消息处理逻辑处理 DrawIO 返回的 SVG 数据
- [x] 测试单页 SVG 导出功能

### 2. 创建 SVG 导出工具库
- [x] 创建 `app/lib/svg-export-utils.ts` 文件
- [x] 实现 `parsePages(xml: string)` 函数
  - 使用 DOMParser 解析 XML
  - 提取所有 `<diagram>` 元素
  - 返回页面信息数组：`{ id, name, index, xmlContent }`
- [x] 实现 `createSinglePageXml(diagram: Element)` 函数
  - 为单个 diagram 元素生成完整的 mxfile XML
  - 确保生成的 XML 可以被 DrawIO 正确加载
- [x] 实现 `exportAllPagesSVG(editorRef, fullXml)` 函数
  - 解析所有页面
  - 循环处理每一页：
    - 生成单页 XML
    - 临时加载到编辑器（调用 `loadDiagram`）
    - 导出该页 SVG（调用 `exportSVG`）
  - 返回所有页面的 SVG 数组
  - 支持进度回调（可选）
- [x] 实现 `serializeSVGsToBlob(svgs)` 函数
  - 将 SVG 数组序列化为 JSON 字符串
  - 转换为 Blob 用于存储
- [x] 实现 `deserializeSVGsFromBlob(blob)` 函数
  - 从 Blob 读取数据
  - 反序列化为 SVG 数组

### 3. 单元测试
- [x] 测试 `parsePages` 能正确解析多页面 XML
- [x] 测试 `createSinglePageXml` 生成的 XML 格式正确
- [x] 测试 `exportAllPagesSVG` 能导出所有页面
- [x] 测试序列化/反序列化往返一致性

## 🎯 验收标准
1. ✅ `DrawioEditorNative` 组件支持 `exportSVG()` 方法
2. ✅ 能成功导出单页图表的 SVG
3. ✅ 能成功导出多页图表的所有页面 SVG
4. ✅ `svg-export-utils.ts` 工具库所有函数功能正常
5. ✅ 导出的 SVG 格式正确，可以在浏览器中正常显示
6. ✅ 序列化/反序列化功能正常，无数据丢失

## 📌 注意事项
- DrawIO postMessage API 不支持直接切换页面，需要通过重新加载单页 XML 实现
- 确保 SVG 导出的异步操作正确处理 Promise
- 多页面导出需要按顺序执行，避免并发加载导致混乱
- SVG 字符串可能很大，注意内存使用

## 🔗 依赖关系
- 无前置依赖，这是第一个里程碑

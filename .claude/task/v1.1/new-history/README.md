# 历史记录 SVG 预览图功能

## 功能概述

在历史记录列表中显示每个对话最后一次 AI 修改保存的 SVG 预览图。

## 用户需求

- 缩略图在卡片左侧展示（类似文件管理器风格）
- 没有 AI 修改的对话显示占位图标

## 技术原理

```
Conversation → Message.xml_version_id → XMLVersion.preview_svg
```

## 里程碑列表

| 里程碑 | 文件                        | 说明                  |
| ------ | --------------------------- | --------------------- |
| M1     | `m1-preview-hook.md`        | 创建预览数据加载 Hook |
| M2     | `m2-thumbnail-component.md` | 创建缩略图展示组件    |
| M3     | `m3-list-integration.md`    | 集成到历史记录列表    |
| M4     | `m4-styles.md`              | 样式完善              |
| M5     | `m5-i18n.md`                | 国际化支持            |

## 依赖的现有 API

- `useStorageConversations().getMessages()`
- `useStorageXMLVersions().getXMLVersionSVGData()`
- `decompressBlob()` from `compression-utils`

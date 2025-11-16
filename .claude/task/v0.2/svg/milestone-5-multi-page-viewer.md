# 里程碑5：多页面SVG查看器

## 🎯 目标

创建一个独立的多页面 SVG 查看器组件，支持分页浏览历史版本的所有页面 SVG。

## 📝 涉及文件

- `app/components/version/PageSVGViewer.tsx` - 新建多页面查看器
- `app/components/version/VersionCard.tsx` - 集成查看器
- 相关样式文件

## ✅ 任务清单

### 1. 创建 PageSVGViewer 组件

- [x] 创建 `app/components/version/PageSVGViewer.tsx`
- [x] 定义组件接口
  ```typescript
  interface PageSVGViewerProps {
    version: XMLVersion;
    isOpen: boolean;
    onClose: () => void;
    defaultPageIndex?: number; // 默认显示的页面索引
  }
  ```
- [x] 实现基础组件结构
  - 使用 Dialog/Modal 或全屏模式
  - 包含页面切换器
  - 包含关闭按钮

### 2. 实现 SVG 数据加载

- [x] 从 `version.pages_svg` 加载所有页面 SVG

  ```typescript
  const [allPages, setAllPages] = useState<Array<{
    id: string;
    name: string;
    svg: string;
  }> | null>(null);

  useEffect(() => {
    if (version.pages_svg && isOpen) {
      deserializeSVGsFromBlob(version.pages_svg).then(setAllPages);
    }
  }, [version.pages_svg, isOpen]);
  ```

- [x] 添加加载状态指示器
- [x] 处理加载失败情况

### 3. 实现页面切换功能

- [x] 添加当前页面状态
  ```typescript
  const [currentPageIndex, setCurrentPageIndex] = useState(
    defaultPageIndex || 0,
  );
  ```
- [x] 创建页面切换器 UI
  - **方案A：标签页式**
    ```typescript
    <Tabs value={currentPageIndex} onChange={setCurrentPageIndex}>
      {allPages.map((page, i) => (
        <Tab key={page.id} value={i}>{page.name}</Tab>
      ))}
    </Tabs>
    ```
  - **方案B：下拉选择式**
    ```typescript
    <Select value={currentPageIndex} onChange={setCurrentPageIndex}>
      {allPages.map((page, i) => (
        <Option key={page.id} value={i}>{page.name}</Option>
      ))}
    </Select>
    ```
  - **方案C：左右箭头式**
    ```typescript
    <Button onClick={() => setCurrentPageIndex(i - 1)}>← 上一页</Button>
    <span>{currentPageIndex + 1} / {allPages.length}</span>
    <Button onClick={() => setCurrentPageIndex(i + 1)}>下一页 →</Button>
    ```
- [x] 支持键盘快捷键（左右箭头切换页面）
- [x] 禁用边界按钮（首页禁用上一页，末页禁用下一页）

### 4. 实现 SVG 显示

- [x] 显示当前页面的 SVG
  ```typescript
  {allPages && (
    <div className="svg-container">
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(allPages[currentPageIndex].svg)}`}
        alt={allPages[currentPageIndex].name}
      />
    </div>
  )}
  ```
- [x] 添加 SVG 缩放功能
  - 适应窗口大小
  - 支持放大/缩小
  - 支持还原原始大小
- [x] 添加 SVG 拖拽平移功能（放大时）
- [x] 优化大尺寸 SVG 的显示性能

### 5. 添加辅助功能

- [x] 显示页面名称
- [x] 显示当前页码（如 "2 / 5"）
- [x] 添加"导出当前页"按钮
  ```typescript
  const handleExportPage = () => {
    const svg = allPages[currentPageIndex].svg;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${allPages[currentPageIndex].name}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };
  ```
- [x] 添加"导出所有页"按钮（可选）
- [x] 添加全屏模式切换

### 6. 集成到 VersionCard

- [x] 在 `VersionCard.tsx` 中添加查看器状态
  ```typescript
  const [viewerOpen, setViewerOpen] = useState(false);
  ```
- [x] 点击"查看所有页面"时打开查看器

  ```typescript
  <Button onClick={() => setViewerOpen(true)}>
    查看所有 {version.page_count} 页
  </Button>

  <PageSVGViewer
    version={version}
    isOpen={viewerOpen}
    onClose={() => setViewerOpen(false)}
  />
  ```

- [x] 点击缩略图时打开查看器并定位到第一页

### 7. 样式设计

- [x] 设计查看器布局
  - 顶部：页面切换器
  - 中间：SVG 显示区域（占据大部分空间）
  - 底部：工具栏（缩放、导出等）
- [x] 响应式设计，移动端适配
- [x] 添加过渡动画（页面切换时）
- [x] 优化视觉效果

### 8. 测试

- [x] 测试单页版本（虽然不会打开查看器，但要确保不报错）
- [x] 测试多页版本（2页、5页、10页）
- [x] 测试页面切换功能
- [x] 测试键盘快捷键
- [x] 测试缩放和拖拽功能
- [x] 测试导出功能
- [x] 测试加载失败情况
- [x] 测试性能（大量页面或大尺寸 SVG）

## 🎯 验收标准

1. ✅ 能打开多页面 SVG 查看器
2. ✅ 能正确加载并显示所有页面
3. ✅ 能流畅切换页面（标签页/箭头/键盘）
4. ✅ SVG 显示清晰，支持缩放
5. ✅ 能导出当前页面的 SVG 文件
6. ✅ UI 美观，操作直观
7. ✅ 移动端显示正常
8. ✅ 性能良好，无卡顿

## 📌 注意事项

- **性能**：大量页面时考虑虚拟化或延迟加载
- **内存**：及时清理不再使用的 ObjectURL
- **安全**：使用 `encodeURIComponent` 避免 XSS
- **无障碍**：添加适当的 ARIA 标签，支持键盘操作
- **缩放**：考虑使用第三方库（如 `react-zoom-pan-pinch`）简化实现

## 🔗 依赖关系

- 依赖 **里程碑2** 完成（数据库包含 `pages_svg` 字段）
- 依赖 **里程碑3** 完成（版本已保存所有页面 SVG）
- 依赖 **里程碑4** 完成（VersionCard 中调用查看器）

---

## ✅ 里程碑完成状态

**状态**: 已完成 ✅
**完成日期**: 2025-11-16

### 实现亮点

1. **完整的组件实现** - `PageSVGViewer.tsx` (529行)，提供全屏/半屏多页浏览体验
2. **公共工具抽离** - `version-utils.ts` 统一处理 Blob 解析与页面名称解析
3. **增强的交互体验**:
   - 多种导航方式（箭头按钮、下拉选择、键盘快捷键）
   - Ctrl/Cmd + 滚轮缩放
   - 拖拽平移（放大时）
   - 全屏模式切换
4. **完善的可访问性**:
   - 预览图与缩略图支持键盘操作（Enter/Space）
   - ARIA 标签与 role 属性
   - focus-visible 样式
5. **导出功能** - 支持导出当前页 SVG 或所有页 JSON
6. **完整的样式系统** - 新增 ~250 行 CSS，包含交互动效与响应式设计
7. **文档更新** - 同步更新 AGENTS.md 与组件文档

### 涉及文件

- ✅ `app/components/version/PageSVGViewer.tsx` (新建)
- ✅ `app/components/version/version-utils.ts` (新建)
- ✅ `app/components/version/VersionCard.tsx` (修改)
- ✅ `app/components/version/index.ts` (修改)
- ✅ `app/styles/components/version-timeline.css` (修改)
- ✅ `AGENTS.md` (更新)
- ✅ `app/components/AGENTS.md` (更新)

# 里程碑 3：搜索功能实现

**状态**：⏳ 待开始
**预计耗时**：45 分钟
**依赖**：里程碑 1, 2

## 目标

实现实时搜索过滤功能，帮助用户快速定位设置项，提升大型设置页面的可用性。

## 任务清单

### 1. 添加搜索状态管理

- [ ] 在 `SettingsSidebar.tsx` 中添加搜索相关状态：
  ```typescript
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredSections, setFilteredSections] = useState<{
    pathConfig: boolean;
    llmConfig: boolean;
  }>({
    pathConfig: true,
    llmConfig: true,
  });
  ```

### 2. 定义可搜索的设置项

- [ ] 创建设置项元数据：
  ```typescript
  // 设置项元数据（用于搜索）
  const SETTINGS_METADATA = {
    pathConfig: {
      title: "文件路径配置",
      description: "设置 DrawIO 文件的默认保存位置",
      keywords: ["文件", "路径", "保存", "默认", "启动", "folder", "path"],
    },
    llmConfig: {
      title: "LLM 配置",
      description: "配置 AI 助手的连接参数和行为",
      keywords: [
        "LLM",
        "AI",
        "助手",
        "API",
        "密钥",
        "模型",
        "温度",
        "供应商",
        "提示词",
        "工具",
        "调用",
        "轮次",
        "测试",
        "openai",
        "deepseek",
        "reasoning",
      ],
    },
  };
  ```

### 3. 实现搜索过滤逻辑

- [ ] 添加搜索过滤函数：

  ```typescript
  // 搜索过滤逻辑
  useEffect(() => {
    if (!searchQuery.trim()) {
      // 无搜索词，显示所有区块
      setFilteredSections({
        pathConfig: true,
        llmConfig: true,
      });
      return;
    }

    const query = searchQuery.toLowerCase();

    // 检查是否匹配
    const matchSection = (metadata: typeof SETTINGS_METADATA.pathConfig) => {
      return (
        metadata.title.toLowerCase().includes(query) ||
        metadata.description.toLowerCase().includes(query) ||
        metadata.keywords.some((keyword) =>
          keyword.toLowerCase().includes(query),
        )
      );
    };

    setFilteredSections({
      pathConfig: matchSection(SETTINGS_METADATA.pathConfig),
      llmConfig: matchSection(SETTINGS_METADATA.llmConfig),
    });
  }, [searchQuery]);
  ```

### 4. 添加搜索输入框

- [ ] 在设置页面顶部添加搜索框：

  ```tsx
  <div className="sidebar-container">
    {/* 搜索框 */}
    <div className="settings-search-container">
      <TextField className="w-full">
        <Label className="sr-only">搜索设置</Label>
        <div className="relative">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索设置项..."
            className="settings-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="settings-search-clear"
              aria-label="清除搜索"
            >
              ✕
            </button>
          )}
        </div>
      </TextField>
      {searchQuery && (
        <Description className="mt-2 text-xs">
          找到 {Object.values(filteredSections).filter(Boolean).length}{" "}
          个匹配的设置区块
        </Description>
      )}
    </div>

    {/* 设置内容区域 */}
    <div className="sidebar-content space-y-6">{/* ... 卡片内容 */}</div>
  </div>
  ```

### 5. 应用过滤效果

- [ ] 根据过滤结果显示/隐藏卡片：

  ```tsx
  <div className="sidebar-content space-y-6">
    {/* 文件路径配置卡片 */}
    {filteredSections.pathConfig && (
      <Card.Root
        className={`settings-card ${
          searchQuery ? "settings-card-highlighted" : ""
        }`}
        variant="outlined"
      >
        {/* ... 卡片内容 */}
      </Card.Root>
    )}

    {/* LLM 配置卡片 */}
    {filteredSections.llmConfig && (
      <Card.Root
        className={`settings-card ${
          searchQuery ? "settings-card-highlighted" : ""
        }`}
        variant="outlined"
      >
        {/* ... 卡片内容 */}
      </Card.Root>
    )}

    {/* 无结果提示 */}
    {searchQuery &&
      !filteredSections.pathConfig &&
      !filteredSections.llmConfig && (
        <div className="settings-no-results">
          <p className="text-muted">未找到匹配的设置项</p>
          <p className="text-xs text-muted mt-2">
            尝试使用其他关键词，如 "API"、"路径"、"模型" 等
          </p>
        </div>
      )}
  </div>
  ```

### 6. 添加搜索样式

- [ ] 在 `app/styles/components/forms.css` 中添加搜索样式：

  ```css
  /* 搜索容器 */
  .settings-search-container {
    padding: 1rem 1.5rem;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-light);
    position: sticky;
    top: 0;
    z-index: 10;
    backdrop-filter: blur(8px);
  }

  /* 搜索输入框 */
  .settings-search-input {
    padding-right: 2.5rem;
  }

  /* 清除按钮 */
  .settings-search-clear {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--gray-bg);
    color: var(--gray-primary);
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .settings-search-clear:hover {
    background: var(--gray-border);
    color: var(--gray-light);
  }

  /* 高亮卡片 */
  .settings-card-highlighted {
    animation: highlight-pulse 0.5s ease-out;
  }

  @keyframes highlight-pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(51, 136, 187, 0.4);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(51, 136, 187, 0.1);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(51, 136, 187, 0);
    }
  }

  /* 无结果提示 */
  .settings-no-results {
    padding: 3rem 1.5rem;
    text-align: center;
  }

  .settings-no-results p {
    color: var(--gray-primary);
  }
  ```

### 7. 优化搜索体验

- [ ] 添加防抖优化（可选）：

  ```typescript
  // 防抖搜索（可选，如果设置项很多）
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 使用 debouncedQuery 进行过滤
  useEffect(() => {
    // ... 过滤逻辑使用 debouncedQuery
  }, [debouncedQuery]);
  ```

## 验收标准

- [ ] 搜索框固定在顶部（sticky）
- [ ] 输入搜索词实时过滤设置区块
- [ ] 匹配的卡片显示，未匹配的隐藏
- [ ] 搜索时卡片有高亮动画
- [ ] 显示匹配结果数量
- [ ] 清除按钮可清空搜索
- [ ] 无结果时显示提示信息
- [ ] 搜索支持中文和英文关键词
- [ ] 搜索不区分大小写
- [ ] 清空搜索后恢复所有卡片

## 测试步骤

1. 启动开发服务器 `pnpm run dev`
2. 打开设置侧边栏
3. 测试搜索功能：
   - 输入 "路径" - 应显示文件路径配置
   - 输入 "API" - 应显示 LLM 配置
   - 输入 "模型" - 应显示 LLM 配置
   - 输入 "xyz" - 应显示无结果提示
4. 测试清除功能：
   - 点击清除按钮
   - 验证所有卡片恢复显示
5. 测试高亮效果：
   - 输入搜索词
   - 观察匹配卡片的高亮动画
6. 测试结果计数：
   - 验证匹配数量显示正确
7. 测试滚动：
   - 搜索框应固定在顶部
   - 滚动内容时搜索框不动

## 设计要点

### 搜索策略

- **多字段匹配**：标题、描述、关键词
- **不区分大小写**：toLowerCase() 处理
- **部分匹配**：includes() 而非完全匹配
- **关键词扩展**：中英文、同义词

### 视觉反馈

- **高亮动画**：匹配卡片有脉冲效果
- **结果计数**：显示匹配数量
- **无结果提示**：友好的提示信息
- **清除按钮**：快速清空搜索

### 性能优化

- **防抖处理**：减少不必要的过滤计算
- **条件渲染**：未匹配的卡片不渲染
- **Sticky 定位**：搜索框始终可见

## 注意事项

- 搜索框使用 sticky 定位，确保在滚动时可见
- 关键词列表应覆盖所有重要的搜索词
- 高亮动画不应过于频繁，避免干扰用户
- 无结果提示应提供有用的建议
- 测试中英文混合搜索

## 扩展功能（可选）

- [ ] 搜索历史记录
- [ ] 搜索建议/自动完成
- [ ] 高亮匹配的文本
- [ ] 键盘快捷键（Ctrl+F）
- [ ] 搜索结果排序（相关度）

## 破坏性变更

- ⚠️ 添加新的顶部搜索区域，可能影响布局
- ⚠️ 卡片可能被隐藏，需要确保状态管理正确

## 回滚方案

如果搜索功能影响性能：

1. 移除防抖，使用即时过滤
2. 简化关键词列表
3. 移除高亮动画
4. 或者完全移除搜索功能

---

**下一步**：完成后继续 [里程碑 4：样式优化与动画](./milestone-4.md)

# 里程碑 2：控件组件化升级

**状态**：⏳ 待开始
**预计耗时**：60 分钟
**依赖**：里程碑 1

## 目标

使用 HeroUI v3 RadioGroup 组件替代原生 select，提供更直观的供应商选择体验，并优化滑块控件样式。

## 任务清单

### 1. 导入 RadioGroup 组件

- [ ] 在 `app/components/SettingsSidebar.tsx` 中导入 RadioGroup 相关组件：
  ```typescript
  import {
    Button,
    TextField,
    Label,
    Input,
    Description,
    TextArea,
    Card,
    Separator,
    RadioGroup, // 新增
    Radio, // 新增
  } from "@heroui/react";
  ```

### 2. 替换供应商选择为 RadioGroup

- [ ] 将原生 `<select>` 替换为 RadioGroup：
  ```tsx
  {
    /* 供应商选择 */
  }
  <div className="w-full">
    <Label className="mb-3">请求供应商</Label>
    <RadioGroup
      value={llmConfig.providerType}
      onChange={(value) =>
        setLlmConfig({
          ...llmConfig,
          providerType: value as ProviderType,
        })
      }
      className="gap-3"
    >
      {PROVIDER_OPTIONS.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          isDisabled={option.disabled}
          className="provider-radio-item"
        >
          <Radio.Control>
            <Radio.Indicator>
              <span className="radio-check">✓</span>
            </Radio.Indicator>
          </Radio.Control>
          <Radio.Content>
            <Label className="font-medium">{option.label}</Label>
            <Description className="text-xs">{option.description}</Description>
          </Radio.Content>
        </Radio.Root>
      ))}
    </RadioGroup>
    <Description className="mt-3">根据接口兼容性选择请求方式</Description>
  </div>;
  ```

### 3. 优化滑块控件样式

- [ ] 增强温度滑块的视觉效果：

  ```tsx
  {
    /* 请求温度 */
  }
  <div className="w-full">
    <div className="flex justify-between items-center mb-2">
      <Label>请求温度</Label>
      <span className="text-sm font-medium text-primary">
        {llmConfig.temperature.toFixed(2)}
      </span>
    </div>
    <input
      type="range"
      min="0"
      max="2"
      step="0.01"
      value={llmConfig.temperature}
      onChange={(e) =>
        setLlmConfig({
          ...llmConfig,
          temperature: parseFloat(e.target.value),
        })
      }
      className="w-full temperature-slider"
    />
    <div className="flex justify-between text-xs text-muted mt-1">
      <span>0.00 (精确)</span>
      <span>1.00 (平衡)</span>
      <span>2.00 (创造)</span>
    </div>
    <Description className="mt-2">
      控制生成的随机性，范围 0-2，值越大越随机
    </Description>
  </div>;
  ```

- [ ] 优化最大工具调用轮次滑块：
  ```tsx
  {
    /* 最大工具调用轮次 */
  }
  <div className="w-full">
    <div className="flex justify-between items-center mb-2">
      <Label>最大工具调用轮次</Label>
      <span className="text-sm font-medium text-primary">
        {llmConfig.maxToolRounds}
      </span>
    </div>
    <input
      type="range"
      min="1"
      max="20"
      step="1"
      value={llmConfig.maxToolRounds}
      onChange={(e) =>
        setLlmConfig({
          ...llmConfig,
          maxToolRounds: parseInt(e.target.value),
        })
      }
      className="w-full temperature-slider"
    />
    <div className="flex justify-between text-xs text-muted mt-1">
      <span>1 (最少)</span>
      <span>10 (推荐)</span>
      <span>20 (最多)</span>
    </div>
    <Description className="mt-2">
      限制 AI 工具调用的最大循环次数，防止无限循环（范围 1-20）
    </Description>
  </div>;
  ```

### 4. 添加 RadioGroup 样式

- [ ] 在 `app/styles/components/forms.css` 中添加 RadioGroup 样式：

  ```css
  /* RadioGroup 供应商选择样式 */
  .provider-radio-item {
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border-primary);
    background: var(--bg-primary);
    transition: all 0.2s var(--ease-out-cubic);
    cursor: pointer;
  }

  .provider-radio-item:hover {
    border-color: var(--primary-color);
    background: var(--bg-secondary);
    box-shadow: var(--shadow-sm);
  }

  .provider-radio-item[data-selected="true"] {
    border-color: var(--primary-color);
    background: var(--primary-light);
    box-shadow: 0 0 0 2px rgba(51, 136, 187, 0.15);
  }

  .provider-radio-item[data-disabled="true"] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .radio-check {
    color: var(--primary-color);
    font-size: 0.75rem;
    font-weight: bold;
  }
  ```

### 5. 优化滑块样式

- [ ] 增强滑块的视觉效果和动画：

  ```css
  /* 优化滑块样式 */
  .temperature-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 8px;
    background: linear-gradient(
      to right,
      var(--primary-light) 0%,
      var(--primary-color) 50%,
      var(--primary-hover) 100%
    );
    border-radius: 4px;
    outline: none;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .temperature-slider:hover {
    opacity: 0.9;
  }

  .temperature-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    background: var(--primary-color);
    border: 2px solid white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(51, 136, 187, 0.3);
    transition: all 0.2s ease;
  }

  .temperature-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
    box-shadow: 0 3px 6px rgba(51, 136, 187, 0.4);
  }

  .temperature-slider::-webkit-slider-thumb:active {
    transform: scale(1.05);
  }

  .temperature-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--primary-color);
    border: 2px solid white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(51, 136, 187, 0.3);
    transition: all 0.2s ease;
  }

  .temperature-slider::-moz-range-thumb:hover {
    transform: scale(1.15);
    box-shadow: 0 3px 6px rgba(51, 136, 187, 0.4);
  }

  .temperature-slider::-moz-range-thumb:active {
    transform: scale(1.05);
  }
  ```

### 6. 添加滑块刻度标签样式

- [ ] 添加刻度标签的样式：

  ```css
  /* 滑块刻度标签 */
  .text-muted {
    color: var(--gray-light);
  }

  .text-primary {
    color: var(--primary-color);
  }
  ```

## 验收标准

- [ ] 供应商选择使用 RadioGroup 组件
- [ ] 每个 Radio 选项显示标题和详细描述
- [ ] Radio 选中状态有明显的视觉反馈
- [ ] Radio hover 时有边框和背景变化
- [ ] 滑块显示当前值（右上角）
- [ ] 滑块有刻度标签（左、中、右）
- [ ] 滑块拖动时有平滑动画
- [ ] 滑块 thumb hover 时有放大效果
- [ ] 所有控件使用 #3388BB 主题色
- [ ] 配置保存和加载正常工作

## 测试步骤

1. 启动开发服务器 `pnpm run dev`
2. 打开设置侧边栏
3. 测试 RadioGroup：
   - 点击不同的供应商选项
   - 验证选中状态视觉反馈
   - 检查 hover 效果
   - 确认描述文本显示
4. 测试温度滑块：
   - 拖动滑块
   - 观察当前值显示
   - 检查刻度标签
   - 验证 hover 放大效果
5. 测试轮次滑块：
   - 拖动滑块
   - 观察当前值显示
   - 检查刻度标签
6. 测试配置保存：
   - 修改供应商和滑块值
   - 点击保存
   - 刷新页面
   - 验证配置恢复

## 设计要点

### RadioGroup 优势

- **更直观**：所有选项一目了然，无需点击展开
- **更详细**：每个选项可显示详细描述
- **更易用**：大面积点击区域，易于操作
- **更美观**：符合 Material Design 风格

### 滑块优化

- **当前值显示**：右上角实时显示当前值
- **刻度标签**：提供参考值，帮助用户理解
- **视觉反馈**：hover 和 active 状态有明显变化
- **平滑动画**：所有交互都有过渡效果

### 主题色统一

- **Radio 选中**：使用 #3388BB 边框和背景
- **滑块轨道**：使用 #3388BB 渐变
- **滑块 thumb**：使用 #3388BB 填充
- **当前值**：使用 #3388BB 文字颜色

## 注意事项

- RadioGroup 会占用更多垂直空间（约 3 倍于 select）
- 确保 RadioGroup 的 onChange 事件正确处理类型转换
- 滑块的 gradient 背景可能在某些浏览器中显示不同
- 测试所有供应商选项的切换功能
- 验证配置的序列化和反序列化

## 破坏性变更

- ⚠️ 移除 `.provider-select` 类名和原生 select 元素
- ⚠️ RadioGroup 占用更多垂直空间，可能需要调整滚动区域
- ⚠️ 滑块样式完全重写，移除旧的 `.temperature-slider` 样式

## 回滚方案

如果 RadioGroup 占用空间过大：

1. 可以考虑使用 `orientation="horizontal"` 水平布局
2. 或者保留原生 select，仅优化样式
3. 或者使用 Accordion 折叠不常用的选项

---

**下一步**：完成后继续 [里程碑 3：搜索功能实现](./milestone-3.md)

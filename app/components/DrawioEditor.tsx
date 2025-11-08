"use client";

import { useRef, useEffect } from "react";
import { DrawIoEmbed, DrawIoEmbedRef } from "react-drawio";

interface DrawioEditorProps {
  initialXml?: string;
  onSave?: (xml: string) => void;
}

export default function DrawioEditor({
  initialXml,
  onSave,
}: DrawioEditorProps) {
  const drawioRef = useRef<DrawIoEmbedRef>(null);

  // 组件挂载时的日志
  useEffect(() => {
    console.log("DrawioEditor 组件已挂载");
    console.log("initialXml:", initialXml ? "存在" : "不存在");
    return () => {
      console.log("DrawioEditor 组件将卸载");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当编辑器准备好时
  const handleLoad = () => {
    console.log("✅ DrawIO 编辑器已加载成功！");
  };

  // 自动保存功能
  const handleAutoSave = (data: { xml: string }) => {
    console.log("自动保存触发");
    if (onSave && data.xml) {
      onSave(data.xml);
    }
  };

  // 导出功能
  const handleExport = (data: unknown) => {
    console.log("导出触发", data);
  };

  return (
    <div className="drawio-container">
      <DrawIoEmbed
        ref={drawioRef}
        xml={initialXml}
        urlParameters={{
          ui: "kennedy", // 使用 Kennedy UI 主题
          spin: true, // 显示加载动画
          libraries: true, // 启用库
          saveAndExit: true, // 保存并退出按钮
          noSaveBtn: false, // 显示保存按钮
          noExitBtn: true, // 隐藏退出按钮
        }}
        configuration={{
          defaultGridEnabled: true, // 默认启用网格
          defaultGridColor: "#d0d0d0", // 网格颜色
        }}
        onLoad={handleLoad}
        onSave={handleAutoSave}
        onExport={handleExport}
      />
    </div>
  );
}

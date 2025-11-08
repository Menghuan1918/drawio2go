/**
 * Markdown 渲染组件配置
 */

import { type Components as MarkdownComponents } from "react-markdown";

export const markdownComponents: MarkdownComponents = {
  a({ node: _node, ...props }) {
    return (
      <a
        {...props}
        className="message-link"
        target="_blank"
        rel="noopener noreferrer"
      />
    );
  },
  code({ node: _node, className, children, ...props }) {
    const content = String(children).replace(/\n$/, "");
    const isInline = !className?.includes("language-");

    if (isInline) {
      return (
        <code className={`inline-code ${className ?? ""}`.trim()} {...props}>
          {content}
        </code>
      );
    }

    return (
      <pre className={`code-block ${className ?? ""}`.trim()}>
        <code>{content}</code>
      </pre>
    );
  },
  blockquote({ node: _node, ...props }) {
    return <blockquote className="message-quote" {...props} />;
  },
  ul({ node: _node, ...props }) {
    return <ul className="message-list" {...props} />;
  },
  ol({ node: _node, ...props }) {
    return <ol className="message-list message-list-ordered" {...props} />;
  },
};

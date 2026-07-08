import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChatMarkdown from "@/components/chat/chat-markdown";
import QuizMarkdown from "@/components/quiz/quiz-markdown";
import MarkdownRenderer, {
  markdownRendererVariants,
} from "@/lib/markdown/renderer";

function renderMarkdown(
  children: string,
  variant: "note" | "chat" | "quiz" = "note",
) {
  return renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { variant, children }),
  );
}

describe("MarkdownRenderer variants", () => {
  it("keeps GFM enabled for all variants", () => {
    const markdown = "- [x] done\n\n| A | B |\n| - | - |\n| 1 | 2 |";

    for (const variant of ["note", "chat", "quiz"] as const) {
      const html = renderMarkdown(markdown, variant);
      expect(html).toContain(`data-markdown-variant=\"${variant}\"`);
      expect(html).toContain("contains-task-list");
      expect(html).toContain("<table>");
    }
  });

  it("keeps math rendering available through KaTeX", () => {
    const html = renderMarkdown("Inline $x^2$ and display:\n\n$$x^2$$", "chat");

    expect(html).toContain("katex");
    expect(html).not.toContain("$x^2$");
    expect(html).not.toContain("$$x^2$$");
  });

  it("sanitizes unsafe raw HTML in the note variant after parsing allowed raw HTML", () => {
    const html = renderMarkdown(
      '<mark>safe</mark><script>alert(1)</script><img src="x" onerror="alert(1)" />',
      "note",
    );

    expect(html).toContain("<mark>safe</mark>");
    expect(html).toContain('<img src="x"/>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=");
  });

  it("keeps chat and quiz raw HTML disabled and sanitized explicitly", () => {
    expect(markdownRendererVariants.chat).toMatchObject({
      allowRawHtml: false,
      sanitize: true,
    });
    expect(markdownRendererVariants.quiz).toMatchObject({
      allowRawHtml: false,
      sanitize: true,
    });

    for (const variant of ["chat", "quiz"] as const) {
      const html = renderMarkdown('<img src="x" onerror="alert(1)"><script>x</script>', variant);
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("onerror=");
      expect(html).toContain("<p>x</p>");
    }
  });

  it("renders fenced code blocks through the lazy Shiki CodeBlock path", () => {
    const html = renderMarkdown("```javascript\nconst value = 1\n```", "quiz");

    expect(html).toContain("<pre");
    expect(html).toContain('data-shiki-state="loading"');
    expect(html).toContain('class="language-javascript"');
    expect(html).not.toContain('class="rounded bg-surface');
  });

  it("preserves explicit surface styling through thin chat and quiz wrappers", () => {
    const chatHtml = renderToStaticMarkup(
      React.createElement(ChatMarkdown, null, "line one\nline two"),
    );
    const quizHtml = renderToStaticMarkup(
      React.createElement(QuizMarkdown, {
        className: "quiz-copy",
        children: "line one\nline two",
      }),
    );

    expect(chatHtml).toContain('data-markdown-variant="chat"');
    expect(chatHtml).toContain("text-sm leading-relaxed");
    expect(chatHtml).toContain("<br/>");
    expect(quizHtml).toContain('data-markdown-variant="quiz"');
    expect(quizHtml).toContain("quiz-copy");
    expect(quizHtml).not.toContain("<br/>");
  });
});

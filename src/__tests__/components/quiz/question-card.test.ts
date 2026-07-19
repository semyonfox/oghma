import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizOptionText } from "@/components/quiz/question-card";

describe("QuizOptionText", () => {
  it("shows Markdown syntax literally instead of turning choices into blocks", () => {
    const html = renderToStaticMarkup(
      React.createElement(QuizOptionText, { children: "## H2 Header" }),
    );

    expect(html).toContain("## H2 Header");
    expect(html).not.toContain("<h2");
  });
});

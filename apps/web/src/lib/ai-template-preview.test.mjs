import { describe, expect, test } from "bun:test";
import { renderAiTemplatePreviewHtml } from "./ai-template-preview.ts";

describe("AI template preview", () => {
  test("renders headings, checklists, and tables", () => {
    const html = renderAiTemplatePreviewHtml("## Cues\n\n- [ ] [Question]\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<h2>Cues</h2>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
  });

  test("drops raw HTML, link targets, and remote images from untrusted output", () => {
    const html = renderAiTemplatePreviewHtml(
      "<img src=x onerror=alert(1)>\n\n[<img src=x onerror=1>**label**](javascript:alert(1)) ![pixel](https://example.com/p.png)",
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("example.com");
    expect(html).toContain("<strong>label</strong>");
  });

  test("returns an empty string for blank Markdown", () => {
    expect(renderAiTemplatePreviewHtml("  \n")).toBe("");
  });
});

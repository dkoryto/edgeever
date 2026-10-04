import { Marked } from "marked";

// AI output is untrusted: render Markdown structure only, dropping raw HTML, link targets, and remote images.
const safeTemplateMarked = new Marked({
  gfm: true,
  renderer: {
    html: () => "",
    image: () => "",
    link(token) {
      return this.parser.parseInline(token.tokens);
    },
  },
});

export const renderAiTemplatePreviewHtml = (markdown: string) =>
  markdown.trim() ? (safeTemplateMarked.parse(markdown, { async: false }) as string) : "";

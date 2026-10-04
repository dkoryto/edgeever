import { describe, expect, test } from "bun:test";
import {
  AI_TEMPLATE_GENERATION_MAX_OUTPUT_TOKENS,
  MAX_AI_TEMPLATE_DESCRIPTION_LENGTH,
  buildAiTemplateGenerationRequest,
  parseAiGeneratedTemplate,
  resolveAiTemplateLanguageName,
} from "./ai-template-generation.ts";
import { PluginAiGenerateSchema } from "./plugin-capabilities.ts";

describe("AI template generation request", () => {
  test("asks for a reusable JSON template skeleton in the interface language", () => {
    const request = buildAiTemplateGenerationRequest({ description: "  Cornell notes  ", locale: "pl" });
    expect(request.system).toContain("reusable Markdown note templates");
    expect(request.system).toContain("placeholders");
    expect(request.system).toContain("- [ ]");
    expect(request.system).toContain("in Polish unless the user's request explicitly asks for another language");
    expect(request.system).toContain('"contentMarkdown"');
    expect(request.prompt).toContain("Requested template:\nCornell notes");
    expect(request.prompt).not.toContain("Previous attempt");
    expect(request.maxOutputTokens).toBe(AI_TEMPLATE_GENERATION_MAX_OUTPUT_TOKENS);
  });

  test("fits the existing generic AI text generation schema", () => {
    const request = buildAiTemplateGenerationRequest({
      description: "x".repeat(MAX_AI_TEMPLATE_DESCRIPTION_LENGTH + 500),
      locale: "zh-CN",
    });
    expect(PluginAiGenerateSchema.safeParse(request).success).toBe(true);
    expect(request.prompt.length).toBeLessThan(MAX_AI_TEMPLATE_DESCRIPTION_LENGTH + 200);
  });

  test("asks for a fresh variation when regenerating", () => {
    const request = buildAiTemplateGenerationRequest({ description: "Weekly review", locale: "en-US", previousTitle: "Weekly Review" });
    expect(request.prompt).toContain('Previous attempt was titled "Weekly Review"');
  });

  test("maps locales to language names", () => {
    expect(resolveAiTemplateLanguageName("en-US")).toBe("English");
    expect(resolveAiTemplateLanguageName("zh-CN")).toBe("Simplified Chinese");
    expect(resolveAiTemplateLanguageName("zh-TW")).toBe("Traditional Chinese");
    expect(resolveAiTemplateLanguageName("ja")).toBe("Japanese");
    expect(resolveAiTemplateLanguageName("pl-PL")).toBe("Polish");
    expect(resolveAiTemplateLanguageName(undefined)).toBe("English");
    expect(resolveAiTemplateLanguageName("xx-YY")).toBe("xx-YY");
  });
});

describe("AI template response parsing", () => {
  const fallback = { fallbackTitle: "AI template" };

  test("parses the requested JSON object", () => {
    const template = parseAiGeneratedTemplate(
      JSON.stringify({ title: " Cornell Notes ", description: "For lectures.", contentMarkdown: "## Cues\n\n- [ ] [Question]" }),
      fallback,
    );
    expect(template).toEqual({ title: "Cornell Notes", description: "For lectures.", contentMarkdown: "## Cues\n\n- [ ] [Question]" });
  });

  test("accepts fenced JSON, reasoning blocks, and alternative keys", () => {
    const text = "<think>I should use {braces} carefully</think>\n```json\n{\"name\":\"Reading card\",\"content\":\"## Quote\\n[Quote]\"}\n```";
    expect(parseAiGeneratedTemplate(text, fallback)).toEqual({
      title: "Reading card",
      description: "",
      contentMarkdown: "## Quote\n[Quote]",
    });
  });

  test("skips stray braces before the real JSON object", () => {
    const text = 'Here is it {not json} {"title":"Daily log","description":"","contentMarkdown":"- [ ] [Task]"}';
    expect(parseAiGeneratedTemplate(text, fallback).title).toBe("Daily log");
  });

  test("falls back to Markdown and uses the first heading as the title", () => {
    const template = parseAiGeneratedTemplate("# Meeting notes\n\n## Agenda\n- [ ] [Item]", fallback);
    expect(template.title).toBe("Meeting notes");
    expect(template.description).toBe("");
    expect(template.contentMarkdown).toContain("## Agenda");
  });

  test("uses the fallback title for headingless Markdown", () => {
    expect(parseAiGeneratedTemplate("- [ ] [Task]", fallback).title).toBe("AI template");
  });

  test("trims over-long fields instead of discarding the draft", () => {
    const template = parseAiGeneratedTemplate(
      JSON.stringify({ title: "T".repeat(500), description: "D".repeat(900), contentMarkdown: "## A" }),
      fallback,
    );
    expect(template.title.length).toBe(120);
    expect(template.description.length).toBe(300);
  });

  test("rejects empty or invalid JSON responses", () => {
    expect(() => parseAiGeneratedTemplate("   ", fallback)).toThrow();
    expect(() => parseAiGeneratedTemplate('{"title":"","contentMarkdown":""}', fallback)).toThrow();
  });
});

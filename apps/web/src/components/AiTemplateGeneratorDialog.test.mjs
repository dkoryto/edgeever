import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const dialogSource = readFileSync(new URL("./AiTemplateGeneratorDialog.tsx", import.meta.url), "utf8");
const paneSource = readFileSync(new URL("./TemplatesPane.tsx", import.meta.url), "utf8");

describe("AI template generator", () => {
  test("reuses the generic AI text capability instead of a template-specific route", () => {
    expect(dialogSource).toContain("api.pluginAi.generate(");
    expect(dialogSource).toContain("buildAiTemplateGenerationRequest(");
    expect(dialogSource).toContain("parseAiGeneratedTemplate(");
    expect(dialogSource).not.toContain("/api/v1/");
  });

  test("renders untrusted AI Markdown through the safe preview renderer", () => {
    expect(dialogSource).toContain("renderAiTemplatePreviewHtml(");
    expect(dialogSource).not.toContain('from "marked"');
  });

  test("keeps the draft editable and saves through the normal custom template path", () => {
    expect(dialogSource).toContain("templates.aiRegenerate");
    expect(dialogSource).toContain("templates.aiSaveAsTemplate");
    expect(dialogSource).toContain("templates.aiRetry");
    expect(paneSource).toContain("onSave={onCreateSavedTemplate}");
  });

  test("gates the entry on a configured default model and explains why with a Tooltip", () => {
    expect(paneSource).toContain("resolveBuiltinAgentModel(aiSettingsQuery.data)");
    expect(paneSource).toContain("aiModel && !aiModel.unavailable");
    expect(paneSource).toContain('t("templates.aiConfigureModel")');
    expect(paneSource).toContain("<TooltipContent");
    expect(`${dialogSource}\n${paneSource}`).not.toMatch(/\stitle=["{]/);
  });
});

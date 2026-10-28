import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CHEMISTRY_EXAMPLES, insertChemistryExample, isChemistryLatex, mathFormulaSubjectOf } from "./chemistry-formula.ts";
import { renderMathPreview } from "./math-formula-preview.ts";

const locales = ["en-US", "pl", "zh-CN", "ja", "ru"].map((name) =>
  readFileSync(new URL(`../../../../../packages/shared/src/i18n/${name}.ts`, import.meta.url), "utf8"));

describe("chemistry formulas in the formula dialog", () => {
  test("recognizes mhchem formulas so they open in the chemistry mode", () => {
    for (const latex of ["\\ce{H2O}", "x + \\ce{CO2}", "\\pu{5 mol}", "\\ce {NaCl}"]) {
      expect(isChemistryLatex(latex)).toBe(true);
      expect(mathFormulaSubjectOf(latex)).toBe("chemistry");
    }
    for (const latex of ["", "E = mc^2", "\\cent", "\\cos x", "\\put"]) {
      expect(isChemistryLatex(latex)).toBe(false);
      expect(mathFormulaSubjectOf(latex)).toBe("math");
    }
  });

  test("every example renders inline and as a display formula, with a label in every locale", () => {
    expect(CHEMISTRY_EXAMPLES.length).toBeGreaterThanOrEqual(8);
    for (const example of CHEMISTRY_EXAMPLES) {
      expect(isChemistryLatex(example.latex)).toBe(true);
      expect(renderMathPreview(example.latex, "inline")).toContain('class="katex"');
      expect(renderMathPreview(example.latex, "block")).toContain("katex-display");
      for (const catalog of locales) expect(catalog).toMatch(new RegExp(`\\n\\s+${example.key}: "`));
    }
  });

  test("the preview renders reactions with arrows and charges instead of an error", () => {
    const html = renderMathPreview("\\ce{2H2 + O2 -> 2H2O}", "inline");
    expect(html).toContain("katex");
    expect(html).not.toContain("#cc0000");
    expect(renderMathPreview("\\ce{H2O", "inline")).toBe("");
  });

  test("inserts an example into an empty field, at the caret, or inside an open \\ce", () => {
    expect(insertChemistryExample("", 0, 0, "\\ce{H2O}")).toEqual({ value: "\\ce{H2O}", caret: 8 });
    expect(insertChemistryExample("Water:", 6, 6, "\\ce{H2O}")).toEqual({ value: "Water: \\ce{H2O}", caret: 15 });
    expect(insertChemistryExample("a  b", 2, 2, "\\ce{H2O}")).toEqual({ value: "a \\ce{H2O} b", caret: 10 });
    const inside = "\\ce{A -> }";
    expect(insertChemistryExample(inside, 9, 9, "\\ce{H2O}")).toEqual({ value: "\\ce{A -> H2O}", caret: 12 });
    expect(insertChemistryExample("\\ce{X}", 0, 6, "\\pu{1 mol}")).toEqual({ value: "\\pu{1 mol}", caret: 10 });
  });

  test("the dialog keeps chemistry out of the visual math editor and uses shadcn tooltips", () => {
    const dialog = readFileSync(new URL("../dialogs/MathFormulaDialog.tsx", import.meta.url), "utf8");
    expect(dialog).toContain('setInputMode(isChemistryLatex(initialLatex) ? "source" : "visual")');
    expect(dialog).toContain('subject === "math" && !isChemistryLatex(latex)');
    expect(dialog).toContain("<TooltipContent>");
    expect(dialog).not.toMatch(/\btitle=/);
  });
});

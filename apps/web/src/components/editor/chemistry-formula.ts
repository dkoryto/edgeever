export type MathFormulaSubject = "math" | "chemistry";

/** Formulas written with the KaTeX mhchem commands `\ce{…}` or `\pu{…}`. */
export const isChemistryLatex = (latex: string) => /\\(?:ce|pu)\s*\{/.test(latex);

export const mathFormulaSubjectOf = (latex: string): MathFormulaSubject =>
  isChemistryLatex(latex) ? "chemistry" : "math";

export type ChemistryExample = {
  /** Key under `mathFormulaDialog.chemistryExamples`. */
  key: string;
  latex: string;
};

/** One-click starting points that cover the mhchem syntax people need most. */
export const CHEMISTRY_EXAMPLES: readonly ChemistryExample[] = [
  { key: "formula", latex: "\\ce{H2O}" },
  { key: "ion", latex: "\\ce{SO4^2-}" },
  { key: "reaction", latex: "\\ce{2H2 + O2 -> 2H2O}" },
  { key: "equilibrium", latex: "\\ce{N2 + 3H2 <=> 2NH3}" },
  { key: "conditions", latex: "\\ce{CaCO3 ->[\\Delta] CaO + CO2}" },
  { key: "gasPrecipitate", latex: "\\ce{Ag+ + Cl- -> AgCl v}" },
  { key: "states", latex: "\\ce{NaCl(s) -> Na+(aq) + Cl-(aq)}" },
  { key: "isotope", latex: "\\ce{^{14}_{6}C}" },
  { key: "hydrate", latex: "\\ce{CuSO4*5H2O}" },
  { key: "units", latex: "\\pu{123 kJ/mol}" },
];

/**
 * Inserts an example at the caret. An empty field takes the example as is; a
 * caret inside an existing `\ce{…}` gets only the example's content so the
 * result stays one valid command.
 */
export const insertChemistryExample = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  example: string,
) => {
  if (!value.trim()) return { value: example, caret: example.length };
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const inner = /^\\(?:ce|pu)\{([\s\S]*)\}$/.exec(example)?.[1];
  const insideCommand = inner !== undefined && /\\(?:ce|pu)\{[^{}]*$/.test(before) && /^[^{}]*\}/.test(after);
  const text = insideCommand ? inner : example;
  const spacer = before && !/\s$/.test(before) ? " " : "";
  const inserted = `${spacer}${text}`;
  return { value: `${before}${inserted}${after}`, caret: before.length + inserted.length };
};

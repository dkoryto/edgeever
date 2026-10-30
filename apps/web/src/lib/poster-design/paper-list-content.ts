import type { PosterDocument } from "@edgeever/shared";

// Shared by the actual template selection and gallery thumbnails.
export const paperListSampleCopy = (zh: boolean) => ({
  title: zh ? "值得反复读的好书" : "BOOKS TO COME BACK TO",
  subtitle: zh
    ? "《看见日常》\n副标题：观察与记录\n核心观点：把目光放回生活，在细微之处发现值得记录的瞬间。慢下来观察，平凡的一天也能成为灵感的起点。一束光、一段对话、一个新的念头，都值得被认真看见。\n阅读收获：好的记录从观察开始。试着为每天留下一小段文字，写下当时的感受，而不只是发生了什么。重新读起时，那些细节会带你回到生活本来的温度。\n\n《思考的力量》\n副标题：提问与理解\n核心观点：从一个好问题开始，建立自己的理解与判断。把复杂的事情拆开，找到真正值得追问的部分。遇到不同意见时，先理解对方的理由，再回头检查自己的假设。\n阅读收获：答案之外，更重要的是思考的过程。保留疑问，比较不同观点，在反复阅读中形成自己的认识。把读到的想法与生活里的具体问题联系起来，让理解慢慢变得清晰。"
    : "The everyday\nSubtitle: Observe and remember\nThe idea: Notice the small moments. Slow down and look closely; an ordinary day can become the beginning of something meaningful. A conversation, a patch of light, or a new thought is worth keeping.\nTakeaway: A good record begins with attention. Write a little each day about how a moment felt, as well as what happened. When you return to those pages, the details bring everyday life into focus.\n\nThe art of thinking\nSubtitle: Question and understand\nThe idea: Start with a better question. Break a complex subject into smaller parts and find what is worth exploring. Before judging a different view, understand its reasons and examine your own assumptions.\nTakeaway: Look beyond the answer. Compare perspectives, keep your questions, and build a view of your own. Connect what you read with a concrete problem in your life and let understanding grow over time.",
  badge: "",
});

export function parsePaperListRow(row: string) {
  const [heading = "", ...lines] = row.split("\n");
  const match = /^(?:副标题[：:]|Subtitle:)\s*(.*)$/i.exec(lines[0] ?? "");
  return { heading, subtitle: match?.[1], body: (match ? lines.slice(1) : lines).join("\n") };
}

type Copy = { title: string; subtitle: string; badge: string };

export function paperListSelectionCopy(document: PosterDocument, copy: Copy, zh: boolean, starterCopy?: Pick<Copy, "title" | "subtitle">): Copy {
  const sample = paperListSampleCopy(zh);
  const previousSample = sample.subtitle.replace(/\n(?:副标题[：:]|Subtitle:)\s*[^\n]*\n/g, "\n");
  // Upgrade the previous bundled example only when every word is untouched.
  if (!document.sourceMemoId && document.templateId === "paper-list" && copy.title === sample.title && copy.subtitle === previousSample && !copy.badge) return sample;
  // Only replace the editor's exact starter text. Imported notes and user copy
  // must never acquire sample paragraphs when changing styles.
  if (starterCopy && !document.sourceMemoId && !document.elements.some(element => /^(?:section|card)-\d+-/.test(element.id)) &&
    copy.title === starterCopy.title && copy.subtitle === starterCopy.subtitle && !copy.badge) return paperListSampleCopy(zh);
  return copy;
}

// Row text is independently editable. Reconstruct from the current layers so
// resizing or reapplying cannot restore an older copy over the user's edits.
export function paperListCurrentCopy(document: PosterDocument, copy: Copy): Copy {
  if (document.templateId !== "paper-list") return copy;
  const rows = new Map<number, { heading?: string; subtitle?: string; body?: string; paragraphs?: Map<number, string> }>();
  for (const element of document.elements) {
    if (element.type !== "text") continue;
    const match = /^paper-list:row:(\d+):(heading|subtitle|body|paragraph:(\d+))$/.exec(element.name ?? "");
    if (!match) continue;
    const row = rows.get(Number(match[1])) ?? {};
    if (match[3]) {
      row.paragraphs ??= new Map();
      row.paragraphs.set(Number(match[3]), element.sourceText ?? element.text);
    } else row[match[2] as "heading" | "subtitle" | "body"] = element.sourceText ?? element.text;
    rows.set(Number(match[1]), row);
  }
  if (!rows.size) return copy;
  return { ...copy, subtitle: [...rows].sort(([a], [b]) => a - b).map(([, row]) => [row.heading, row.subtitle === undefined ? undefined : `${/副标题[：:]/.test(copy.subtitle) ? "副标题：" : "Subtitle: "}${row.subtitle}`, row.body, ...[...(row.paragraphs ?? [])].sort(([a], [b]) => a - b).map(([, text]) => text)].filter(value => value !== undefined).join("\n")).join("\n\n") };
}


// Derive the paragraph lead-in from its current text rather than storing a
// duplicate label or adding rich-text data to saved poster documents.
export function paperListParagraphStyles(element: { type: string; name?: string; text?: string }) {
  if (element.type !== "text" || !/^paper-list:row:\d+:(?:body|paragraph:\d+)$/.test(element.name ?? "")) return undefined;
  const prefix = /^[^\n：:]{1,16}[：:]/u.exec(element.text ?? "")?.[0];
  if (!prefix) return undefined;
  return { 0: Object.fromEntries(Array.from(prefix).map((_, index) => [index, { fontWeight: "bold" as const }])) };
}

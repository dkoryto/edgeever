import { expect, test, type Locator, type Page } from "@playwright/test";

const createMemo = async (page: Page, title: string) => {
  const notebooksResponse = await page.request.get("/api/v1/notebooks");
  expect(notebooksResponse.ok()).toBe(true);
  const notebooks = await notebooksResponse.json() as { notebooks: Array<{ id: string }> };
  const notebookId = notebooks.notebooks[0]?.id;
  expect(notebookId).toBeTruthy();

  const createResponse = await page.request.post("/api/v1/memos", {
    data: { notebookId, title, contentMarkdown: "" },
  });
  expect(createResponse.status()).toBe(201);
  return (await createResponse.json() as { memo: { id: string } }).memo;
};

const deleteMemo = async (page: Page, memoId: string) => {
  await page.request.delete(`/api/v1/memos/${memoId}`);
  await page.request.delete(`/api/v1/memos/${memoId}?permanent=1`);
};

const dispatchPaste = async (editor: Locator, entries: Record<string, string>) => {
  await editor.evaluate((element, data) => {
    const clipboardData = new DataTransfer();
    for (const [type, value] of Object.entries(data)) clipboardData.setData(type, value);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  }, entries);
};

// Issue #660: Markdown copied from a plain-text source.
const MARKDOWN = [
  "# 一级标题",
  "",
  "普通文字中包含 **粗体**、*斜体*、~~删除线~~ 和 `行内代码`。",
  "",
  "- 第一项",
  "- 第二项",
  "",
  "1. 打开笔记。",
  "2. 粘贴 Markdown 文本。",
  "",
  "> 引用",
  "",
  "```js",
  "const count = 1;",
  "```",
  "",
  "| 列 A | 列 B |",
  "| --- | --- |",
  "| 1 | 2 |",
].join("\n");

test("renders Markdown pasted as plain text in the rich-text editor", async ({ page }) => {
  const title = `Markdown text paste ${Date.now()}`;
  const memo = await createMemo(page, title);

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "全部笔记", exact: true }).click();
    await page.getByPlaceholder("搜索笔记").fill(title);
    await page.locator(`[data-memo-id="${memo.id}"]`).locator("button").first().click();

    const editor = page.locator(".ProseMirror[contenteditable='true']");
    await expect(editor).toBeEditable();
    await editor.click();
    await dispatchPaste(editor, { "text/plain": MARKDOWN });

    await expect(editor.locator("h1")).toHaveText("一级标题");
    await expect(editor.locator("strong")).toHaveText("粗体");
    await expect(editor.locator("em")).toHaveText("斜体");
    await expect(editor.locator("s")).toHaveText("删除线");
    await expect(editor.locator("p code")).toHaveText("行内代码");
    await expect(editor.locator("ul > li")).toHaveCount(2);
    await expect(editor.locator("ol > li")).toHaveCount(2);
    await expect(editor.locator("blockquote")).toContainText("引用");
    const codeBlocks = editor.getByRole("button", { name: "复制代码" });
    await expect(codeBlocks).toHaveCount(1);
    await expect(editor).toContainText("const count = 1;");
    await expect(editor.locator("table td")).toHaveCount(2);
    await expect(editor).not.toContainText("# 一级标题");
    await expect(editor).not.toContainText("| --- |");

    // One undo step removes the whole paste.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor.locator("h1")).toHaveCount(0);
    await expect(editor.locator("table")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(editor.locator("h1")).toHaveText("一级标题");

    // A code copy from VS Code stays a code block rather than becoming a list.
    await editor.locator("h1").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await dispatchPaste(editor, {
      "text/plain": "/**\n * Adds numbers.\n */",
      "text/html": "<div><span>/**</span></div>",
      "vscode-editor-data": JSON.stringify({ mode: "typescript" }),
    });
    await expect(codeBlocks).toHaveCount(2);
    await expect(editor.locator("ul > li")).toHaveCount(2);

    await expect.poll(async () => {
      const response = await page.request.get(`/api/v1/memos/${memo.id}`);
      const body = await response.json() as { memo: { contentMarkdown: string } };
      return body.memo.contentMarkdown;
    }, { timeout: 20_000 }).toContain("# 一级标题");
  } finally {
    await deleteMemo(page, memo.id);
  }
});

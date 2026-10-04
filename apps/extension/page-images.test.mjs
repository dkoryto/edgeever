import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  embedPageImages,
  MAX_PAGE_IMAGES,
  pageImageRefs,
  replacePageImageUrls,
} from "./src/page-images.ts";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const createClient = ({ failUploadFor = [], failSave = false } = {}) => {
  const calls = { uploads: [], saves: [] };
  let next = 0;
  return {
    calls,
    client: {
      uploadImage: async (memoId, file) => {
        if (failUploadFor.includes(file.filename)) throw new Error("upload failed");
        calls.uploads.push({ memoId, file });
        next += 1;
        return { id: `res_${next}` };
      },
      createEditSession: async () => ({ editSession: { id: "es_1", baseRevision: 1, baseContentHash: "hash" } }),
      saveMemo: async (memoId, body) => {
        if (failSave) throw new Error("conflict");
        calls.saves.push({ memoId, body });
        return {};
      },
    },
  };
};

describe("page clip images", () => {
  test("finds remote image addresses, resolving relative ones against the page", () => {
    const markdown = [
      "![Hero](https://cdn.example.com/hero.png)",
      "![rel](/img/a.jpg \"Caption\")",
      "![dup](https://cdn.example.com/hero.png)",
      "![data](data:image/png;base64,AAAA)",
      "![local](/api/v1/resources/res_1/blob)",
      "[not an image](https://example.com/page)",
      "![](<https://cdn.example.com/with space.png>)",
    ].join("\n\n");

    expect(pageImageRefs(markdown, "https://example.com/post/1")).toEqual([
      { raw: "https://cdn.example.com/hero.png", url: "https://cdn.example.com/hero.png" },
      { raw: "/img/a.jpg", url: "https://example.com/img/a.jpg" },
      { raw: "https://cdn.example.com/with space.png", url: "https://cdn.example.com/with%20space.png" },
    ]);
  });

  test("caps how many images one clip copies", () => {
    const markdown = Array.from({ length: MAX_PAGE_IMAGES + 5 }, (_, index) => `![](https://cdn.example.com/${index}.png)`).join("\n");
    expect(pageImageRefs(markdown, "https://example.com")).toHaveLength(MAX_PAGE_IMAGES);
  });

  test("rewrites only uploaded images and keeps alt text and titles", () => {
    const markdown = "![Hero](https://cdn.example.com/hero.png \"Title\")\n\n![Other](https://cdn.example.com/other.png)";
    expect(replacePageImageUrls(markdown, [{ raw: "https://cdn.example.com/hero.png", resourceId: "res_9" }])).toBe(
      "![Hero](/api/v1/resources/res_9/blob \"Title\")\n\n![Other](https://cdn.example.com/other.png)",
    );
  });

  test("uploads downloaded images and saves the rewritten note once", async () => {
    const markdown = "# Post\n\n![A](https://cdn.example.com/a.png)\n\n![B](https://cdn.example.com/b.png)";
    const images = pageImageRefs(markdown, "https://example.com");
    const { client, calls } = createClient();

    const result = await embedPageImages(client, {
      memoId: "memo_1",
      markdown,
      images,
      download: async () => new Map([["https://cdn.example.com/a.png", { bytes: png, mimeType: "image/png" }]]),
    });

    expect(result).toEqual({ embedded: 1, total: 2 });
    expect(calls.uploads).toHaveLength(1);
    expect(calls.saves).toEqual([{
      memoId: "memo_1",
      body: {
        editSessionId: "es_1",
        expectedRevision: 1,
        expectedContentHash: "hash",
        contentMarkdown: "# Post\n\n![A](/api/v1/resources/res_1/blob)\n\n![B](https://cdn.example.com/b.png)",
      },
    }]);
  });

  test("leaves the saved note untouched when nothing could be copied", async () => {
    const markdown = "![A](https://cdn.example.com/a.png)";
    const { client, calls } = createClient({ failUploadFor: ["a.png"] });

    const result = await embedPageImages(client, {
      memoId: "memo_1",
      markdown,
      images: pageImageRefs(markdown, "https://example.com"),
      download: async () => new Map([["https://cdn.example.com/a.png", { bytes: png, mimeType: "image/png" }]]),
    });

    expect(result).toEqual({ embedded: 0, total: 1 });
    expect(calls.saves).toHaveLength(0);
  });

  test("does not throw when the rewrite conflicts", async () => {
    const markdown = "![A](https://cdn.example.com/a.png)";
    const { client } = createClient({ failSave: true });
    const result = await embedPageImages(client, {
      memoId: "memo_1",
      markdown,
      images: pageImageRefs(markdown, "https://example.com"),
      download: async () => new Map([["https://cdn.example.com/a.png", { bytes: png, mimeType: "image/png" }]]),
    });
    expect(result).toEqual({ embedded: 0, total: 1 });
  });

  test("page and selection clips copy their images after the note is created", () => {
    const background = readFileSync(new URL("./src/background.ts", import.meta.url), "utf8");
    expect(background).toContain("await createMemo(settings, page, tab.id);");
    expect(background).toContain("await embedClipImages(settings, created.memo?.id, contentMarkdown, page.url, tabId, null);");
    expect(background).toContain("await embedClipImages(settings, created.memo?.id, contentMarkdown, sourceUrl, tabId, frameId);");
    expect(background).toContain("func: readPageImagesInPage");
  });
});

import { expect, test } from "bun:test";
import { pickMobileCopy } from "./mobile-copy";

test("picks inline copy for each mobile locale and keeps Japanese on English", () => {
  const copy = { zh: "复制代码", en: "Copy code", pl: "Kopiuj kod" };
  expect(pickMobileCopy("zh-CN", copy)).toBe("复制代码");
  expect(pickMobileCopy("en-US", copy)).toBe("Copy code");
  expect(pickMobileCopy("pl", copy)).toBe("Kopiuj kod");
  expect(pickMobileCopy("ja", copy)).toBe("Copy code");
});

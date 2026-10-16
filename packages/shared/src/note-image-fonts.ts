import { NOTE_IMAGE_FONT_NOTICES } from "./note-image-font-notices";
import { NOTE_IMAGE_FONT_SUBSETS } from "./note-image-font-manifest";
import { resolveTheme, type NoteImageTheme, type NoteImageFontStyle } from "./note-image-card";

export const NOTE_IMAGE_THEME_FONTS = {
  gradient: "puhui", glass: "puhui", quote: "mincho", book: "song", memo: "misans",
  bento: "puhui", "black-sun": "puhui", frame: "puhui", handwritten: "longcang", code: "geist",
} as const;

type AssetUrl = string | number | { uri: string };
const resources = new Map<string, Promise<string>>();
const loadedFaces = new Map<string, Promise<FontFace>>();

const asDataUrl = (url: string): Promise<string> => {
  if (url.startsWith("data:")) return Promise.resolve(url);
  let pending = resources.get(url);
  if (!pending) {
    pending = new Promise<string>((resolve, reject) => {
      // WKWebView's bundled file URLs support XMLHttpRequest, but not fetch.
      const request = new XMLHttpRequest();
      request.open("GET", url);
      request.responseType = "blob";
      request.timeout = 20_000;
      request.onload = () => {
        if ((request.status !== 0 && request.status !== 200) || !request.response?.size) {
          reject(new Error("NOTE_IMAGE_ASSET_UNAVAILABLE"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("NOTE_IMAGE_ASSET_UNAVAILABLE"));
        reader.readAsDataURL(request.response);
      };
      request.onerror = request.ontimeout = () => reject(new Error("NOTE_IMAGE_ASSET_UNAVAILABLE"));
      request.send();
    });
    resources.set(url, pending);
    void pending.catch(() => resources.delete(url));
  }
  return pending;
};

export const fontSubsetContains = (range: string, points: ReadonlySet<number>) => {
  const sorted = [...points].sort((a, b) => a - b);
  return range.split(",").some(part => {
    const [start, end = start] = part.trim().replace(/^U\+/i, "").split("-");
    const lower = parseInt(start.replace(/\?/g, "0"), 16);
    const upper = parseInt(end.replace(/\?/g, "F"), 16);
    let left = 0;
    let right = sorted.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (sorted[middle] < lower) left = middle + 1;
      else right = middle;
    }
    return left < sorted.length && sorted[left] <= upper;
  });
};

/** Only embed subsets used by this card. The editor never eagerly loads entire CJK fonts. */
export const prepareNoteImageAssets = async ({ theme, fontStyle = "auto", text, urls }: {
  theme: NoteImageTheme; fontStyle?: NoteImageFontStyle; text: string; urls: Record<string, AssetUrl>;
}) => {
  const active = resolveTheme(undefined, theme);
  const getAsset = (name: string) => {
    const asset = urls[name];
    if (!asset || typeof asset === "number") throw new Error("NOTE_IMAGE_ASSET_UNAVAILABLE");
    return asDataUrl(typeof asset === "string" ? asset : asset.uri);
  };
  const points = new Set(Array.from(text, char => char.codePointAt(0)!));
  const blocks = fontStyle === "auto"
    ? NOTE_IMAGE_FONT_SUBSETS[NOTE_IMAGE_THEME_FONTS[active]].filter(block => fontSubsetContains(block.range, points))
    : [];
  const fontFacesCss = (await Promise.all(blocks.map(async block => {
    const data = await getAsset(block.asset);
    let loaded = loadedFaces.get(block.asset);
    if (!loaded) {
      const face = new FontFace(block.family, `url("${data}")`, { weight: block.weight, unicodeRange: block.range });
      loaded = face.load().then(font => { document.fonts.add(font); return font; });
      loadedFaces.set(block.asset, loaded);
      void loaded.catch(() => loadedFaces.delete(block.asset));
    }
    await loaded;
    return `@font-face{font-family:"${block.family}";font-style:normal;font-weight:${block.weight};src:url("${data}");unicode-range:${block.range}}`;
  }))).join("\n");
  const fontCss = blocks.length ? `/*! ${NOTE_IMAGE_FONT_NOTICES.replaceAll("*/", "* /")} */\n${fontFacesCss}` : "";
  const textureCss = active === "handwritten"
    ? `.edgeever-image-wrapper{--ee-paper:url("${await getAsset("paper.png")}");--ee-paper-grain:url("${await getAsset("paper-text.png")}")}`
    : "";
  return { fontCss, css: `${fontCss}\n${textureCss}` };
};

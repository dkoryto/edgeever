import { filenameForImage, type ImageNoteClient, type StoredImage } from "./image-clip";

// A long article can reference hundreds of images. Keep the extra uploads after
// a clip bounded; the remaining images keep their original addresses.
export const MAX_PAGE_IMAGES = 30;
export const MAX_PAGE_IMAGE_TOTAL_BYTES = 60 * 1024 * 1024;

export type PageImageRef = {
  /** The address exactly as it appears in the Markdown image syntax. */
  raw: string;
  /** The absolute http(s) address used to download the image. */
  url: string;
};

const IMAGE_SYNTAX = /!\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>\n]*>|[^)\s]+)(\s+"(?:\\.|[^"\\])*")?\s*\)/g;

const unwrapDestination = (destination: string) =>
  destination.startsWith("<") && destination.endsWith(">") ? destination.slice(1, -1) : destination;

const absoluteImageUrl = (raw: string, baseUrl: string) => {
  try {
    const url = new URL(raw, baseUrl || undefined);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

export const pageImageRefs = (markdown: string, baseUrl: string, limit = MAX_PAGE_IMAGES): PageImageRef[] => {
  const refs: PageImageRef[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(IMAGE_SYNTAX)) {
    const raw = unwrapDestination(match[2] ?? "");
    if (!raw || seen.has(raw) || raw.startsWith("/api/v1/resources/")) continue;
    const url = absoluteImageUrl(raw, baseUrl);
    if (!url) continue;
    seen.add(raw);
    refs.push({ raw, url });
    if (refs.length >= limit) break;
  }
  return refs;
};

export const replacePageImageUrls = (
  markdown: string,
  uploaded: ReadonlyArray<{ raw: string; resourceId: string }>,
) => {
  const resources = new Map(uploaded.map((image) => [image.raw, image.resourceId]));
  if (resources.size === 0) return markdown;
  return markdown.replace(IMAGE_SYNTAX, (whole, alt: string, destination: string, title?: string) => {
    const resourceId = resources.get(unwrapDestination(destination));
    if (!resourceId) return whole;
    return `![${alt}](/api/v1/resources/${encodeURIComponent(resourceId)}/blob${title ?? ""})`;
  });
};

/**
 * Copies a saved clip's remote images into the note's own resources, then
 * rewrites the note to point at them. The note is already saved before this
 * runs: any image that cannot be downloaded or uploaded keeps its original
 * address, and a failed rewrite leaves the first version untouched.
 */
export const embedPageImages = async (
  client: Pick<ImageNoteClient, "uploadImage" | "createEditSession" | "saveMemo">,
  input: {
    memoId: string;
    markdown: string;
    images: readonly PageImageRef[];
    download: (images: readonly PageImageRef[]) => Promise<Map<string, StoredImage>>;
  },
) => {
  if (input.images.length === 0) return { embedded: 0, total: 0 };
  const downloaded = await input.download(input.images);
  const uploaded: Array<{ raw: string; resourceId: string }> = [];
  let totalBytes = 0;
  for (const image of input.images) {
    const file = downloaded.get(image.url);
    if (!file) continue;
    if (totalBytes + file.bytes.byteLength > MAX_PAGE_IMAGE_TOTAL_BYTES) continue;
    try {
      const resource = await client.uploadImage(input.memoId, {
        bytes: file.bytes,
        mimeType: file.mimeType,
        filename: filenameForImage(image.url, file.mimeType),
      });
      if (!resource.id) continue;
      totalBytes += file.bytes.byteLength;
      uploaded.push({ raw: image.raw, resourceId: resource.id });
    } catch {
      // Keep the remote address for this image.
    }
  }
  if (uploaded.length === 0) return { embedded: 0, total: input.images.length };

  try {
    const session = await client.createEditSession(input.memoId);
    await client.saveMemo(input.memoId, {
      editSessionId: session.editSession.id,
      expectedRevision: session.editSession.baseRevision,
      expectedContentHash: session.editSession.baseContentHash,
      contentMarkdown: replacePageImageUrls(input.markdown, uploaded),
    });
  } catch {
    return { embedded: 0, total: input.images.length };
  }
  return { embedded: uploaded.length, total: input.images.length };
};

// Runs in the clipped page so same-origin and CORS-enabled images can be read
// with the page's own session when the extension itself cannot fetch them.
// Keep this function free of closures: Chrome serializes it with toString().
export async function readPageImagesInPage(
  urls: string[],
  maxBytes: number,
  maxTotalBytes: number,
): Promise<Array<{ url: string; base64: string; type: string } | null>> {
  const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  let total = 0;
  const results: Array<{ url: string; base64: string; type: string } | null> = [];
  for (const url of urls) {
    let result: { url: string; base64: string; type: string } | null = null;
    for (const credentials of ["include", "omit"] as const) {
      try {
        const response = await fetch(url, { credentials, signal: AbortSignal.timeout(15000) });
        if (!response.ok) continue;
        const blob = await response.blob();
        if (blob.size <= 0 || blob.size > maxBytes || total + blob.size > maxTotalBytes) break;
        result = { url, base64: await toBase64(blob), type: blob.type };
        total += blob.size;
        break;
      } catch {
        // Try the next credentials mode, then give up on this image.
      }
    }
    results.push(result);
  }
  return results;
}

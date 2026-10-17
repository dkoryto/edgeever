export type MobileCopyLocale = "zh-CN" | "en-US" | "ja" | "pl";

/**
 * Picks inline copy for call sites that are not keyed through the mobile-locale dictionary.
 * Kept dependency-free so DOM components (WebView bundles) can import it. Japanese falls back to English.
 */
export const pickMobileCopy = (locale: MobileCopyLocale, copy: { zh: string; en: string; pl: string }) =>
  locale === "zh-CN" ? copy.zh : locale === "pl" ? copy.pl : copy.en;

import { useEffect, useState } from "react";

export const EDITOR_SPELLCHECK_STORAGE_KEY = "edgeever.editor.spellcheckEnabled";

export const EDITOR_SPELLCHECK_CHANGED_EVENT = "edgeever:editor-spellcheck-changed";

export const resolveStoredEditorSpellcheckPreference = (stored: string | null): boolean =>
  stored !== "false";

export const readEditorSpellcheckPreference = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return resolveStoredEditorSpellcheckPreference(
      window.localStorage?.getItem(EDITOR_SPELLCHECK_STORAGE_KEY) ?? null,
    );
  } catch {
    return true;
  }
};

export const writeEditorSpellcheckPreference = (enabled: boolean) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(EDITOR_SPELLCHECK_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Private mode / blocked storage — preference is session-only via the event.
  }
  window.dispatchEvent(
    new CustomEvent(EDITOR_SPELLCHECK_CHANGED_EVENT, { detail: enabled }),
  );
};

export const useEditorSpellcheckPreference = (): boolean => {
  const [enabled, setEnabled] = useState(readEditorSpellcheckPreference);

  useEffect(() => {
    const syncPreference = () => setEnabled(readEditorSpellcheckPreference());
    const handlePreferenceChanged = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      if (typeof detail === "boolean") {
        setEnabled(detail);
        return;
      }
      syncPreference();
    };
    window.addEventListener(EDITOR_SPELLCHECK_CHANGED_EVENT, handlePreferenceChanged);
    window.addEventListener("storage", syncPreference);
    return () => {
      window.removeEventListener(EDITOR_SPELLCHECK_CHANGED_EVENT, handlePreferenceChanged);
      window.removeEventListener("storage", syncPreference);
    };
  }, []);

  return enabled;
};

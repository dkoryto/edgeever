import { useEffect, useState } from "react";

export const NOTE_WINDOW_QUERY_PARAM = "noteWindow";
const MEMO_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** The note shown by this renderer when it is a desktop note window. */
export const getNoteWindowMemoId = (search = typeof window === "undefined" ? "" : window.location.search) => {
  if (typeof window === "undefined" || !window.edgeeverDesktop?.isAvailable) return null;
  const memoId = new URLSearchParams(search).get(NOTE_WINDOW_QUERY_PARAM);
  return memoId && MEMO_ID_PATTERN.test(memoId) ? memoId : null;
};

export const canOpenNoteWindows = () =>
  typeof window !== "undefined" && Boolean(window.edgeeverDesktop?.openNoteWindow) && !getNoteWindowMemoId();

/** Notes currently shown in their own desktop windows, as reported by the main process. */
export const useDetachedMemoIds = () => {
  const [memoIds, setMemoIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const bridge = window.edgeeverDesktop;
    if (!bridge?.noteWindows || !bridge.onNoteWindowsChanged || getNoteWindowMemoId()) return;
    let active = true;
    const unsubscribe = bridge.onNoteWindowsChanged((ids) => setMemoIds(new Set(ids)));
    void bridge.noteWindows().then((ids) => {
      if (active) setMemoIds(new Set(ids));
    }, () => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return [memoIds, setMemoIds] as const;
};

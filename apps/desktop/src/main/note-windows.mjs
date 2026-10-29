export const NOTE_WINDOW_QUERY_PARAM = "noteWindow";
export const NOTE_WINDOW_CLOSE_REQUEST_CHANNEL = "desktop:note-window-close-request";

const MEMO_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const isValidNoteWindowMemoId = (value) => typeof value === "string" && MEMO_ID_PATTERN.test(value);

export const noteWindowUrl = (entryUrl, memoId) => {
  const url = new URL(entryUrl);
  url.searchParams.set(NOTE_WINDOW_QUERY_PARAM, memoId);
  return url.href;
};

/**
 * Tracks the separate note windows. A note is shown in at most one of them,
 * and a window closes only after its renderer confirms that pending edits were
 * saved, so closing never silently drops typing.
 */
export const createNoteWindowController = ({
  createWindow,
  showWindow,
  onChange = () => {},
  forcedCloseTimeoutMs = 5_000,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) => {
  const entries = new Map();

  const list = () => [...entries.keys()];
  const live = (entry) => entry && !entry.window.isDestroyed();
  const entryForContents = (contents) => {
    for (const entry of entries.values()) {
      if (live(entry) && entry.window.webContents === contents) return entry;
    }
    return null;
  };

  const settleClose = (entry, closed) => {
    const request = entry.closeRequest;
    if (!request) return;
    entry.closeRequest = null;
    if (request.timer) clearTimer(request.timer);
    for (const resolve of request.waiters) resolve(closed);
  };

  const allowClose = (entry) => {
    entry.closeAllowed = true;
    if (live(entry)) entry.window.close();
  };

  const requestClose = (entry, { forced = false } = {}) => {
    if (!live(entry)) return Promise.resolve(true);
    // A crashed renderer, or one that has not shown the note yet, cannot
    // answer and has nothing unsaved beyond the local draft store.
    if (!entry.listening || entry.window.webContents.isCrashed?.()) {
      allowClose(entry);
      return Promise.resolve(true);
    }
    if (entry.closeRequest) {
      // Closing again after an unanswered request means the renderer is stuck.
      if (!forced && now() - entry.closeRequest.startedAt >= forcedCloseTimeoutMs) {
        allowClose(entry);
        return Promise.resolve(true);
      }
      if (forced && !entry.closeRequest.timer) {
        entry.closeRequest.timer = setTimer(() => allowClose(entry), forcedCloseTimeoutMs);
      }
      return new Promise((resolve) => entry.closeRequest.waiters.push(resolve));
    }
    return new Promise((resolve) => {
      entry.closeRequest = {
        startedAt: now(),
        waiters: [resolve],
        timer: forced ? setTimer(() => allowClose(entry), forcedCloseTimeoutMs) : null,
      };
      entry.window.webContents.send(NOTE_WINDOW_CLOSE_REQUEST_CHANNEL);
    });
  };

  const open = (memoId) => {
    if (!isValidNoteWindowMemoId(memoId)) throw new Error("Invalid note id");
    const existing = entries.get(memoId);
    if (live(existing)) {
      showWindow(existing.window);
      return { opened: false };
    }
    const window = createWindow(memoId);
    const entry = { memoId, window, closeAllowed: false, closeRequest: null, listening: false };
    entries.set(memoId, entry);
    window.on("close", (event) => {
      if (entry.closeAllowed) return;
      event.preventDefault();
      void requestClose(entry);
    });
    window.on("closed", () => {
      settleClose(entry, true);
      if (entries.get(memoId) !== entry) return;
      entries.delete(memoId);
      onChange(list());
    });
    onChange(list());
    return { opened: true };
  };

  const focus = (memoId) => {
    const entry = entries.get(memoId);
    if (!live(entry)) return false;
    showWindow(entry.window);
    return true;
  };

  /** The renderer is ready to answer close requests. */
  const markListening = (contents) => {
    const entry = entryForContents(contents);
    if (entry) entry.listening = true;
    return Boolean(entry);
  };

  /** The renderer answers a close request after trying to save. */
  const resolveClose = (contents, allowed) => {
    const entry = entryForContents(contents);
    if (!entry?.closeRequest) return false;
    if (allowed === true) {
      allowClose(entry);
      return true;
    }
    if (entry.closeRequest.timer) return false;
    settleClose(entry, false);
    return true;
  };

  /** Close every note window, waiting for saves up to the forced timeout. */
  const closeAll = () => Promise.all([...entries.values()].map((entry) => requestClose(entry, { forced: true })));

  return {
    closeAll,
    focus,
    has: (memoId) => live(entries.get(memoId)),
    isNoteWindowContents: (contents) => Boolean(entryForContents(contents)),
    list,
    markListening,
    memoIdForContents: (contents) => entryForContents(contents)?.memoId ?? null,
    open,
    resolveClose,
  };
};

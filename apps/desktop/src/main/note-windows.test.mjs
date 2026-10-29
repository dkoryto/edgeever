import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
  NOTE_WINDOW_CLOSE_REQUEST_CHANNEL,
  createNoteWindowController,
  isValidNoteWindowMemoId,
  noteWindowUrl,
} from "./note-windows.mjs";

class FakeWindow extends EventEmitter {
  constructor(memoId) {
    super();
    this.memoId = memoId;
    this.destroyed = false;
    this.crashed = false;
    this.sent = [];
    this.webContents = {
      send: (channel) => this.sent.push(channel),
      isCrashed: () => this.crashed,
    };
  }
  isDestroyed() { return this.destroyed; }
  // Mirrors BrowserWindow.close(): "close" can be prevented, then "closed" fires.
  close() {
    if (this.destroyed) return;
    let prevented = false;
    this.emit("close", { preventDefault: () => { prevented = true; } });
    if (prevented) return;
    this.destroyed = true;
    this.emit("closed");
  }
}

const setup = ({ listening = true, ...options } = {}) => {
  const windows = [];
  const shown = [];
  const changes = [];
  const timers = [];
  let clock = 0;
  const controller = createNoteWindowController({
    createWindow: (memoId) => { const window = new FakeWindow(memoId); windows.push(window); return window; },
    showWindow: (window) => shown.push(window.memoId),
    onChange: (ids) => changes.push(ids),
    now: () => clock,
    setTimer: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimer: (timer) => { timer.cleared = true; },
    ...options,
  });
  // Windows in these tests have loaded and listen for close requests.
  const open = controller.open;
  if (listening) controller.open = (memoId) => {
    const result = open(memoId);
    const window = windows.find((candidate) => candidate.memoId === memoId && !candidate.isDestroyed());
    if (window) controller.markListening(window.webContents);
    return result;
  };
  return {
    controller, windows, shown, changes, timers,
    advance: (ms) => { clock += ms; },
    fireTimers: () => { for (const timer of timers.splice(0)) if (!timer.cleared) timer.callback(); },
  };
};

describe("note window registry", () => {
  test("validates note ids and builds the window URL on the app entry", () => {
    expect(isValidNoteWindowMemoId("memo_01HZ-abc")).toBe(true);
    for (const value of ["", "../x", "a b", "a/b", "x".repeat(129), null, 42]) expect(isValidNoteWindowMemoId(value)).toBe(false);
    expect(noteWindowUrl("edgeever-app://app/index.html", "memo_1")).toBe("edgeever-app://app/index.html?noteWindow=memo_1");
    expect(noteWindowUrl("http://127.0.0.1:5173", "memo_1")).toBe("http://127.0.0.1:5173/?noteWindow=memo_1");
  });

  test("opens one window per note; opening again focuses it instead of creating another", () => {
    const { controller, windows, shown, changes } = setup();
    expect(controller.open("memo_a")).toEqual({ opened: true });
    expect(controller.open("memo_a")).toEqual({ opened: false });
    expect(controller.open("memo_a")).toEqual({ opened: false });
    expect(windows).toHaveLength(1);
    expect(shown).toEqual(["memo_a", "memo_a"]);
    expect(controller.open("memo_b")).toEqual({ opened: true });
    expect(controller.list()).toEqual(["memo_a", "memo_b"]);
    expect(changes.at(-1)).toEqual(["memo_a", "memo_b"]);
    expect(controller.focus("memo_b")).toBe(true);
    expect(controller.focus("memo_c")).toBe(false);
    expect(() => controller.open("../etc")).toThrow("Invalid note id");
  });

  test("closing asks the renderer first and closes only after it confirms", () => {
    const { controller, windows, changes } = setup();
    controller.open("memo_a");
    const [window] = windows;
    window.close();
    expect(window.isDestroyed()).toBe(false);
    expect(window.sent).toEqual([NOTE_WINDOW_CLOSE_REQUEST_CHANNEL]);
    // A second close while the renderer is still saving does not send twice.
    window.close();
    expect(window.sent).toHaveLength(1);
    expect(controller.resolveClose(window.webContents, true)).toBe(true);
    expect(window.isDestroyed()).toBe(true);
    expect(controller.list()).toEqual([]);
    expect(changes.at(-1)).toEqual([]);
    // The note can be opened again once its window is gone.
    expect(controller.open("memo_a")).toEqual({ opened: true });
  });

  test("a failed save keeps the window open and a later close asks again", () => {
    const { controller, windows } = setup();
    controller.open("memo_a");
    const [window] = windows;
    window.close();
    expect(controller.resolveClose(window.webContents, false)).toBe(true);
    expect(window.isDestroyed()).toBe(false);
    expect(controller.has("memo_a")).toBe(true);
    window.close();
    expect(window.sent).toEqual([NOTE_WINDOW_CLOSE_REQUEST_CHANNEL, NOTE_WINDOW_CLOSE_REQUEST_CHANNEL]);
  });

  test("closing again after an unanswered request lets a stuck renderer go", () => {
    const { controller, windows, advance } = setup();
    controller.open("memo_a");
    const [window] = windows;
    window.close();
    advance(1_000);
    window.close();
    expect(window.isDestroyed()).toBe(false);
    advance(5_000);
    window.close();
    expect(window.isDestroyed()).toBe(true);
  });

  test("a window closed before its note loaded closes without waiting", () => {
    const { controller, windows } = setup({ listening: false });
    controller.open("memo_a");
    windows[0].close();
    expect(windows[0].isDestroyed()).toBe(true);
    expect(windows[0].sent).toEqual([]);
    expect(controller.list()).toEqual([]);
  });

  test("a crashed renderer closes without waiting", () => {
    const { controller, windows } = setup();
    controller.open("memo_a");
    windows[0].crashed = true;
    windows[0].close();
    expect(windows[0].isDestroyed()).toBe(true);
    expect(windows[0].sent).toEqual([]);
  });

  test("closeAll waits for confirmations and forces the rest after the timeout", async () => {
    const { controller, windows, fireTimers } = setup();
    controller.open("memo_a");
    controller.open("memo_b");
    const done = controller.closeAll();
    expect(windows.map((window) => window.sent)).toEqual([[NOTE_WINDOW_CLOSE_REQUEST_CHANNEL], [NOTE_WINDOW_CLOSE_REQUEST_CHANNEL]]);
    controller.resolveClose(windows[0].webContents, true);
    // A refusal cannot hold back quitting or an account switch.
    expect(controller.resolveClose(windows[1].webContents, false)).toBe(false);
    expect(windows[1].isDestroyed()).toBe(false);
    fireTimers();
    expect(await done).toEqual([true, true]);
    expect(controller.list()).toEqual([]);
  });

  test("identifies note window senders and ignores other web contents", () => {
    const { controller, windows } = setup();
    controller.open("memo_a");
    expect(controller.isNoteWindowContents(windows[0].webContents)).toBe(true);
    expect(controller.memoIdForContents(windows[0].webContents)).toBe("memo_a");
    expect(controller.isNoteWindowContents({})).toBe(false);
    expect(controller.resolveClose({}, true)).toBe(false);
    windows[0].crashed = true;
    windows[0].close();
    expect(controller.isNoteWindowContents(windows[0].webContents)).toBe(false);
  });
});

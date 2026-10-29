# Open a note in a new window (desktop)

[简体中文](2026-10-29-desktop-note-window.zh-CN.md)

## Problem and outcome

Implements [Issue #67](https://github.com/tianma-if/edgeever/issues/67). Desktop users could only edit one note at a time in the main window. A note can now be moved to its own window from the note's "More" menu or with File → Open Note in New Window (`Cmd/Ctrl+Shift+O`), so it can sit next to the main window or on another screen.

## Behavior

| ID | Behavior | Acceptance |
| --- | --- | --- |
| W01 | A note is shown in at most one window. Moving it to a new window first saves pending edits in the main editor; the main window then shows a placeholder with a "Show window" button instead of a second editor. | Electron scenario A1: text typed in the main window appears in the new window, and the main window has no editor for that note. |
| W02 | Opening the same note again from the menu item, the shortcut, the note list, quick switcher, plugin links or the placeholder focuses the existing window instead of creating another one. | Unit test "opens one window per note"; Electron scenario A2. |
| W03 | Closing the note window saves pending edits first. The note then opens in the main window again with the saved content. | Unit test "closing asks the renderer first"; Electron scenarios B1, B2. |
| W04 | If saving fails before the move (for example local storage does not answer within 15 s), the note stays in the main window with its content and a message. If saving fails when the window closes, the window stays open with a message; closing it again closes it and the local draft is recovered in the main window. A renderer that stops answering is closed on the second close after 5 s. | Unit tests for failed save and stuck renderer; Electron scenarios D1 (storage paused) and E1. |
| W05 | Quitting, switching account or instance, clearing the session or clearing local data asks every note window to save first and closes it after at most 5 s. Note windows are not restored after a restart. | Unit test "closeAll"; Electron scenario F1 (quit, relaunch, content kept). |
| W06 | Note windows are editor-only: links to other notes open them in the main window, deleting the note closes its window, and several notes can each have their own window. They cannot open further windows, switch account, change the instance or start plugins. | Electron scenarios A3, C1, C2, G1. |
| W07 | Only notes that already exist in storage can be moved; a note that has not been created yet shows "Open in new window after sync". Diagrams, tables, trash and the web app do not offer the action. | Manual check of the menu states. |

## Risk and rollback

The change is desktop-only and adds no data, API or migration change. Main-process IPC that used to accept only the main window now also accepts note windows for the session token, image upload, AI direct requests and renderer error reports; account, instance, data reset and window commands still require the main window. A synchronous IPC handler (`desktop:rich-text-heading-shortcut`) previously returned nothing for other windows, which froze them; it now always answers, and each note window has its own heading-shortcut guard. Electron scenarios were run against the local dev server on macOS only; Windows and Linux are covered by CI unit tests and builds, not by interactive runs. Rollback is a revert; no stored state refers to note windows.

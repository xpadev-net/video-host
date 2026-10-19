import { act, cleanup, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlayerPlayPauseNotificationAtom,
  PlayerSeekNotificationAtom,
  PlayerStateAtom,
  VideoRefAtom,
} from "@/atoms/Player";
import { shouldIgnoreShortcut } from "@/components/Player/utils/shortcuts";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

import { KeyboardHandler } from "@/components/Player/Shared/KeyboardHandler";

const movie = { id: "m1", title: "Movie", variants: [] } as never;

const key = (
  target: EventTarget,
  code: string,
  init: KeyboardEventInit = {},
) => {
  const event = new KeyboardEvent("keydown", {
    code,
    key: code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

describe("shouldIgnoreShortcut", () => {
  const event = (target: Element, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent("keydown", { bubbles: true, ...init });
    Object.defineProperty(e, "target", { value: target });
    return e;
  };

  it("ignores browser combinations and IME composition", () => {
    const body = document.body;
    expect(shouldIgnoreShortcut(event(body, { ctrlKey: true }))).toBe(true);
    expect(shouldIgnoreShortcut(event(body, { metaKey: true }))).toBe(true);
    expect(shouldIgnoreShortcut(event(body, { altKey: true }))).toBe(true);
    expect(shouldIgnoreShortcut(event(body, { isComposing: true }))).toBe(true);
    expect(shouldIgnoreShortcut(event(body))).toBe(false);
  });

  it("ignores text entry controls", () => {
    for (const html of [
      "<input />",
      "<textarea></textarea>",
      "<select></select>",
      '<div contenteditable="true"></div>',
      '<div role="textbox"></div>',
      '<div role="slider"></div>',
    ]) {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.append(host);
      const target = host.firstElementChild as Element;
      expect(shouldIgnoreShortcut(event(target, { code: "ArrowLeft" }))).toBe(
        true,
      );
      host.remove();
    }
  });

  it("leaves Space/Enter to self-activating elements except the player surface", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<button id="b"><span id="in">x</span></button><a href="/x" id="a">l</a><div data-player-surface role="button" id="s"></div>';
    document.body.append(host);
    const get = (id: string) => host.querySelector(`#${id}`) as Element;
    expect(shouldIgnoreShortcut(event(get("b"), { code: "Space" }))).toBe(true);
    expect(shouldIgnoreShortcut(event(get("in"), { code: "Space" }))).toBe(
      true,
    );
    expect(shouldIgnoreShortcut(event(get("a"), { code: "Enter" }))).toBe(true);
    // Arrow keys are not activation keys.
    expect(shouldIgnoreShortcut(event(get("b"), { code: "ArrowLeft" }))).toBe(
      false,
    );
    expect(shouldIgnoreShortcut(event(get("s"), { code: "Space" }))).toBe(
      false,
    );
    host.remove();
  });
});

describe("KeyboardHandler", () => {
  let store: ReturnType<typeof createStore>;
  let video: HTMLVideoElement;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createStore();
    video = document.createElement("video");
    vi.spyOn(video, "play").mockResolvedValue(undefined);
    vi.spyOn(video, "pause").mockImplementation(() => {});
    store.set(VideoRefAtom, video);
    render(
      <Provider store={store}>
        <KeyboardHandler data={movie} />
      </Provider>,
    );
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not hijack Ctrl/Cmd+F", () => {
    for (const init of [{ ctrlKey: true }, { metaKey: true }]) {
      const e = key(document.body, "KeyF", init);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(store.get(PlayerStateAtom).isFullscreen).toBe(false);
  });

  it("toggles fullscreen with plain F", () => {
    const e = key(document.body, "KeyF");
    expect(e.defaultPrevented).toBe(true);
    expect(store.get(PlayerStateAtom).isFullscreen).toBe(true);
  });

  it("ignores shortcuts typed into a text field", () => {
    const input = document.createElement("input");
    document.body.append(input);
    for (const code of ["KeyF", "Space", "KeyT", "ArrowRight"]) {
      const e = key(input, code);
      expect(e.defaultPrevented, code).toBe(false);
    }
    expect(store.get(PlayerStateAtom).isFullscreen).toBe(false);
    expect(video.play).not.toHaveBeenCalled();
    input.remove();
  });

  it("leaves Space on a focused button to the button", () => {
    const button = document.createElement("button");
    document.body.append(button);
    const e = key(button, "Space");
    expect(e.defaultPrevented).toBe(false);
    expect(video.play).not.toHaveBeenCalled();
    button.remove();
  });

  it("toggles playback exactly once on Space over the player surface", () => {
    const surface = document.createElement("div");
    surface.setAttribute("data-player-surface", "");
    surface.setAttribute("role", "button");
    document.body.append(surface);
    key(surface, "Space");
    expect(video.play).toHaveBeenCalledTimes(1);
    surface.remove();
  });

  it("only consumes Escape while fullscreen", () => {
    expect(key(document.body, "Escape").defaultPrevented).toBe(false);
    key(document.body, "KeyF");
    expect(store.get(PlayerStateAtom).isFullscreen).toBe(true);
    expect(key(document.body, "Escape").defaultPrevented).toBe(true);
    expect(store.get(PlayerStateAtom).isFullscreen).toBe(false);
  });

  it("keeps a newer notification alive when pressed again quickly", () => {
    key(document.body, "ArrowRight");
    expect(store.get(PlayerSeekNotificationAtom)).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    key(document.body, "ArrowRight");
    // The first timer would have fired here and wiped the second indicator.
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(store.get(PlayerSeekNotificationAtom)).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(store.get(PlayerSeekNotificationAtom)).toBeNull();

    key(document.body, "KeyK");
    expect(store.get(PlayerPlayPauseNotificationAtom)).not.toBeNull();
  });

  it("clears pending notification timers and the indicators on unmount", () => {
    key(document.body, "ArrowRight");
    key(document.body, "KeyK");
    expect(store.get(PlayerSeekNotificationAtom)).not.toBeNull();
    expect(store.get(PlayerPlayPauseNotificationAtom)).not.toBeNull();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    // Not left behind for the next player to show.
    expect(store.get(PlayerSeekNotificationAtom)).toBeNull();
    expect(store.get(PlayerPlayPauseNotificationAtom)).toBeNull();
  });
});

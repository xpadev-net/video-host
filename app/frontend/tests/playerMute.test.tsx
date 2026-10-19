import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { createStore, Provider, useAtomValue } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlayerConfigAtom,
  PlayerMutedAtom,
  PlayerVolumeAtom,
  VideoRefAtom,
} from "@/atoms/Player";
import { VolumeIcon } from "@/components/Player/DesktopPlayer/Controller/VolumeIcon";
import { VolumeSlider } from "@/components/Player/DesktopPlayer/Controller/VolumeSlider";
import { effectiveVolume, isSilent, toggleMute } from "@/utils/volume";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

import { KeyboardHandler } from "@/components/Player/Shared/KeyboardHandler";

const video = () => {
  const element = document.createElement("video");
  return element;
};

describe("toggleMute", () => {
  it("mutes without touching the volume, and unmutes back to it", () => {
    const element = video();
    element.volume = 0.6;
    toggleMute(element);
    expect(element.muted).toBe(true);
    expect(element.volume).toBe(0.6);
    toggleMute(element);
    expect(element.muted).toBe(false);
    expect(element.volume).toBe(0.6);
  });

  it("makes a video dragged to volume 0 audible again", () => {
    const element = video();
    element.volume = 0;
    toggleMute(element);
    expect(element.muted).toBe(false);
    expect(element.volume).toBe(1);
  });

  it("treats mute or zero volume as silent", () => {
    expect(isSilent(0.5, true)).toBe(true);
    expect(isSilent(0, false)).toBe(true);
    expect(isSilent(0.5, false)).toBe(false);
    expect(effectiveVolume(0.5, true)).toBe(0);
    expect(effectiveVolume(0.5, false)).toBe(0.5);
  });
});

describe("VolumeIcon", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });
  const iconFor = (volume: number, muted: boolean) => {
    const store = createStore();
    store.set(PlayerVolumeAtom, volume);
    store.set(PlayerMutedAtom, muted);
    const { container } = render(
      <Provider store={store}>
        <VolumeIcon />
      </Provider>,
    );
    return container.querySelector("svg")?.getAttribute("class") ?? "";
  };

  it("shows the muted icon while muted even though the volume is kept", () => {
    expect(iconFor(0.8, true)).toContain("lucide-volume-x");
    expect(iconFor(0.8, false)).toContain("lucide-volume-2");
    expect(iconFor(0.3, false)).toContain("lucide-volume-1");
    expect(iconFor(0, false)).toContain("lucide-volume-x");
  });
});

describe("VolumeSlider while muted", () => {
  // Mute is persisted, so one test's state must not leak into the next.
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("shows and announces the retained level, so its arrow keys match", () => {
    const store = createStore();
    const element = video();
    element.volume = 0.8;
    element.muted = true;
    store.set(VideoRefAtom, element);
    store.set(PlayerVolumeAtom, 0.8);
    store.set(PlayerMutedAtom, true);
    const { getByRole } = render(
      <Provider store={store}>
        <VolumeSlider />
      </Provider>,
    );
    const slider = getByRole("slider");
    expect(slider.getAttribute("aria-valuenow")).toBe("80");
    expect(slider.getAttribute("aria-valuetext")).toBe("ミュート中");

    // ArrowDown moves from the announced 80% to 75% and unmutes.
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(element.volume).toBeCloseTo(0.75);
    expect(element.muted).toBe(false);
  });

  it("has no aria-valuetext when not muted", () => {
    const store = createStore();
    store.set(VideoRefAtom, video());
    const { getByRole } = render(
      <Provider store={store}>
        <VolumeSlider />
      </Provider>,
    );
    expect(getByRole("slider").hasAttribute("aria-valuetext")).toBe(false);
  });
});

describe("keyboard volume keys", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("unmute when the volume is adjusted", () => {
    const store = createStore();
    const element = video();
    element.volume = 0.5;
    element.muted = true;
    store.set(VideoRefAtom, element);
    render(
      <Provider store={store}>
        <KeyboardHandler
          data={{ id: "m", title: "t", variants: [] } as never}
        />
      </Provider>,
    );
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "ArrowUp",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(element.muted).toBe(false);
    expect(element.volume).toBeCloseTo(0.6);
  });
});

describe("autoplay setting rename", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const readConfig = () => {
    const store = createStore();
    const { result } = renderHook(() => useAtomValue(PlayerConfigAtom), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });
    return result;
  };

  it("keeps a previously chosen value stored under the old name", async () => {
    localStorage.setItem(
      "playerConfig",
      JSON.stringify({
        windowFullscreen: false,
        autoPlay: false,
        isTheatre: true,
      }),
    );
    const config = readConfig();
    await waitFor(() => expect(config.current.autoPlayNext).toBe(false));
    expect(config.current).toEqual({
      windowFullscreen: false,
      autoPlayNext: false,
      isTheatre: true,
    });
    expect("autoPlay" in config.current).toBe(false);
  });

  it("also migrates updates pushed by another tab on the old release", async () => {
    const store = createStore();
    const { result } = renderHook(() => useAtomValue(PlayerConfigAtom), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });
    expect(result.current.autoPlayNext).toBe(true);
    // A tab still on the previous release writes the old shape.
    const legacy = JSON.stringify({
      windowFullscreen: true,
      autoPlay: false,
      isTheatre: false,
    });
    act(() => {
      localStorage.setItem("playerConfig", legacy);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "playerConfig",
          newValue: legacy,
          storageArea: localStorage,
        }),
      );
    });
    await waitFor(() => expect(result.current.autoPlayNext).toBe(false));
    expect("autoPlay" in result.current).toBe(false);
  });

  it("prefers the new key when both exist and defaults to on", async () => {
    localStorage.setItem(
      "playerConfig",
      JSON.stringify({
        windowFullscreen: true,
        autoPlay: false,
        autoPlayNext: true,
        isTheatre: false,
      }),
    );
    const config = readConfig();
    await waitFor(() => expect(config.current.autoPlayNext).toBe(true));
    cleanup();
    localStorage.clear();
    expect(readConfig().current.autoPlayNext).toBe(true);
  });
});

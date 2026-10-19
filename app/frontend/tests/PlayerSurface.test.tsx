import { cleanup, fireEvent, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

const afk = vi.hoisted(() => ({ toggleControls: vi.fn() }));

vi.mock("@/hooks/usePlayerAfk", () => ({
  usePlayerAfk: () => ({
    isAfk: false,
    showControls: vi.fn(),
    toggleControls: afk.toggleControls,
  }),
}));
vi.mock("@/components/Player/Shared/Video", async () => {
  const React = await import("react");
  return {
    Video: ({
      videoRef,
    }: {
      videoRef: React.RefObject<HTMLVideoElement | null>;
    }) => <video ref={videoRef} data-testid="video" />,
  };
});
vi.mock("@/components/Player/Shared/KeyboardHandler", () => ({
  KeyboardHandler: () => null,
}));
vi.mock("@/components/Player/Shared/MediaSessionHandler", () => ({
  MediaSessionHandler: () => null,
}));
vi.mock("@/components/Player/Shared/PlayerStatusDisplay", () => ({
  PlayerStatusDisplay: () => null,
}));
vi.mock("@/components/ImageWithFallback", () => ({
  ImageWithFallback: () => null,
}));
vi.mock("../src/components/Player/DesktopPlayer/Controller", () => ({
  Controller: () => null,
}));
vi.mock("../src/components/Player/MobilePlayer/Controller", () => ({
  Controller: () => null,
}));

import { PlayerSurface } from "@/components/Player/Shared/PlayerSurface";

const movie = { id: "m1", title: "Movie", variants: [] } as never;

describe("PlayerSurface keyboard activation", () => {
  let windowKeydown: Mock<(event: KeyboardEvent) => void>;

  beforeEach(() => {
    afk.toggleControls.mockClear();
    windowKeydown = vi.fn<(event: KeyboardEvent) => void>();
    window.addEventListener("keydown", windowKeydown);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => {
    window.removeEventListener("keydown", windowKeydown);
    cleanup();
  });

  const renderSurface = (variant: "desktop" | "mobile", isPipMode = false) => {
    const view = render(
      <Provider store={createStore()}>
        <PlayerSurface
          data={movie}
          id="p"
          isPipMode={isPipMode}
          variant={variant}
        />
      </Provider>,
    );
    const surface = view.container.querySelector(
      "[data-player-surface]",
    ) as HTMLElement;
    return { surface, video: view.getByTestId("video") as HTMLVideoElement };
  };

  it("is a div role=button without nested native buttons", () => {
    const { surface } = renderSurface("desktop");
    expect(surface.tagName).toBe("DIV");
    expect(surface.getAttribute("role")).toBe("button");
    expect(surface.querySelector("button")).toBeNull();
  });

  it.each(["Space", "Enter"])(
    "%s plays/pauses once on desktop and does not reach window shortcuts",
    (code) => {
      const { surface, video } = renderSurface("desktop");
      fireEvent.keyDown(surface, { code, key: code === "Space" ? " " : code });
      // One toggle (paused video -> play), and the window never saw the key.
      expect(video.play).toHaveBeenCalledTimes(1);
      expect(windowKeydown).not.toHaveBeenCalled();
    },
  );

  it("works in PiP, where no KeyboardHandler is rendered", () => {
    const { surface, video } = renderSurface("desktop", true);
    fireEvent.keyDown(surface, { code: "Space", key: " " });
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it("Space shows/hides the controls on mobile, like a tap", () => {
    const { surface, video } = renderSurface("mobile");
    fireEvent.keyDown(surface, { code: "Space", key: " " });
    expect(afk.toggleControls).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();
  });

  it("ignores keys that bubble up from descendants", () => {
    const { video } = renderSurface("desktop");
    fireEvent.keyDown(video, { code: "Space", key: " " });
    expect(video.play).not.toHaveBeenCalled();
  });
});

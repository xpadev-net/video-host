import { act, cleanup, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { createRef, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerStateAtom } from "@/atoms/Player";

const hlsMock = vi.hoisted(() => {
  type Handler = (event: string, data: unknown) => void;
  class FakeHls {
    static supported = true;
    static instances: FakeHls[] = [];
    static isSupported = () => FakeHls.supported;
    static Events = {
      AUDIO_TRACKS_UPDATED: "audioTracks",
      AUDIO_TRACK_SWITCHED: "audioSwitched",
      FRAG_LOADED: "fragLoaded",
      ERROR: "error",
    };
    static ErrorTypes = {
      NETWORK_ERROR: "networkError",
      MEDIA_ERROR: "mediaError",
    };
    handlers = new Map<string, Handler>();
    config: Record<string, unknown>;
    loadSource = vi.fn();
    attachMedia = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
    destroy = vi.fn();
    constructor(config: Record<string, unknown>) {
      this.config = config;
      FakeHls.instances.push(this);
    }
    on(event: string, handler: Handler) {
      this.handlers.set(event, handler);
    }
    emit(event: string, data: unknown) {
      this.handlers.get(event)?.(event, data);
    }
  }
  return FakeHls;
});

vi.mock("hls.js", () => ({ default: hlsMock }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/api-origin", () => ({ isApiUrl: () => false }));

import { Video } from "@/components/Player/Shared/Video";

const movieWith = (contentUrl: string) =>
  ({
    id: "m1",
    title: "Movie",
    variants: [{ variantId: "original", contentUrl, status: "READY" }],
  }) as never;

const url = (token: string) =>
  `https://host/vod/${token}/uploads/u/a.mp4/master.m3u8`;

describe("Video", () => {
  let store: ReturnType<typeof createStore>;
  const renderVideo = (movie: unknown) => {
    const videoRef: RefObject<HTMLVideoElement | null> = createRef();
    const ui = (m: unknown) => (
      <Provider store={store}>
        <Video videoRef={videoRef} movie={m as never} />
      </Provider>
    );
    const view = render(ui(movie));
    return { videoRef, rerender: (m: unknown) => view.rerender(ui(m)) };
  };

  beforeEach(() => {
    store = createStore();
    hlsMock.supported = true;
    hlsMock.instances = [];
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
  });
  afterEach(cleanup);

  it("creates exactly one HLS instance per movie", () => {
    renderVideo(movieWith(url("1.a")));
    expect(hlsMock.instances).toHaveLength(1);
    expect(hlsMock.instances[0].loadSource).toHaveBeenCalledWith(url("1.a"));
    expect(hlsMock.instances[0].config.lowLatencyMode).toBeUndefined();
  });

  it("does not recreate HLS when only the movie object changes", () => {
    const { rerender } = renderVideo(movieWith(url("1.a")));
    rerender(movieWith(url("1.a")));
    rerender(movieWith(url("1.a")));
    expect(hlsMock.instances).toHaveLength(1);
    expect(hlsMock.instances[0].destroy).not.toHaveBeenCalled();
  });

  it("loads a different movie from scratch and destroys the old instance", () => {
    const { rerender } = renderVideo(movieWith(url("1.a")));
    rerender(movieWith("https://host/vod/1.a/uploads/u/other.mp4/master.m3u8"));
    expect(hlsMock.instances).toHaveLength(2);
    expect(hlsMock.instances[0].destroy).toHaveBeenCalled();
    expect(hlsMock.instances[1].config.startPosition).toBe(-1);
  });

  it("resumes from the current position when only the token rotates", () => {
    const { rerender, videoRef } = renderVideo(movieWith(url("1.a")));
    if (!videoRef.current) throw new Error("no video element");
    Object.defineProperty(videoRef.current, "currentTime", {
      value: 42,
      configurable: true,
    });
    rerender(movieWith(url("2.b")));
    expect(hlsMock.instances).toHaveLength(2);
    expect(hlsMock.instances[1].config.startPosition).toBe(42);
  });

  it("falls back to native HLS when MSE is unavailable", () => {
    hlsMock.supported = false;
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue(
      "maybe",
    );
    const { videoRef } = renderVideo(movieWith(url("1.a")));
    expect(hlsMock.instances).toHaveLength(0);
    expect(videoRef.current?.getAttribute("src")).toBe(url("1.a"));
    expect(store.get(PlayerStateAtom).error).toBeNull();
  });

  it("reports an error when HLS cannot be played at all", () => {
    hlsMock.supported = false;
    renderVideo(movieWith(url("1.a")));
    expect(store.get(PlayerStateAtom).error).toBeTruthy();
  });

  it("recovers from fatal errors a few times, then surfaces an error", () => {
    renderVideo(movieWith(url("1.a")));
    const hls = hlsMock.instances[0];
    const fatal = (type: string) =>
      act(() => hls.emit("error", { fatal: true, type }));

    fatal("networkError");
    expect(hls.startLoad).toHaveBeenCalledTimes(1);
    fatal("mediaError");
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 4; i++) fatal("networkError");
    expect(hls.startLoad).toHaveBeenCalledTimes(3);
    expect(hls.destroy).toHaveBeenCalled();
    expect(store.get(PlayerStateAtom).error).toBeTruthy();
  });

  it("ignores non-fatal errors", () => {
    renderVideo(movieWith(url("1.a")));
    act(() =>
      hlsMock.instances[0].emit("error", {
        fatal: false,
        type: "networkError",
      }),
    );
    expect(hlsMock.instances[0].startLoad).not.toHaveBeenCalled();
    expect(store.get(PlayerStateAtom).error).toBeNull();
  });
});

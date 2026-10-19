import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "../src/libraries/isMobile";

describe("useIsMobile", () => {
  let matches = true;
  let listener: (() => void) | undefined;

  beforeEach(() => {
    matches = true;
    listener = undefined;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(
        (media: string) =>
          ({
            matches: media === "(pointer: coarse)" && matches,
            media,
            onchange: null,
            addEventListener: (_event: string, callback: () => void) => {
              listener = callback;
            },
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
          }) as unknown as MediaQueryList,
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("tracks coarse-pointer changes for responsive components", () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    matches = false;
    act(() => listener?.());
    expect(result.current).toBe(false);
  });
});

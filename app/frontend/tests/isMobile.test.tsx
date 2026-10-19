import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "../src/libraries/isMobile";

describe("useIsMobile", () => {
  let matches = true;

  beforeEach(() => {
    matches = true;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(
        (media: string) =>
          ({
            matches: media === "(pointer: coarse)" && matches,
            media,
            onchange: null,
            addEventListener: vi.fn(),
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

  it("uses a stable coarse-pointer snapshot for the player lifetime", () => {
    const { result, rerender } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    matches = false;
    rerender();
    expect(result.current).toBe(true);
  });
});

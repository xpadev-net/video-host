import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";
import { useStickySWR } from "../src/hooks/useStickySWR";

describe("useStickySWR", () => {
  it("keeps results for the current key and clears them when the key changes or is disabled", async () => {
    const cache = new Map();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SWRConfig
        value={{
          provider: () => cache,
          dedupingInterval: 0,
          shouldRetryOnError: false,
        }}
      >
        {children}
      </SWRConfig>
    );
    const { result, rerender } = renderHook(
      ({ key }: { key: string | null }) =>
        useStickySWR(key, (url: string) => Promise.resolve(url), {}),
      { initialProps: { key: "/first" as string | null }, wrapper },
    );

    await waitFor(() => expect(result.current.data).toBe("/first"));

    rerender({ key: "/second" });
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.data).toBe("/second"));

    rerender({ key: "" });
    expect(result.current.data).toBeUndefined();

    rerender({ key: "/third" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toBe("/third"));

    rerender({ key: null });
    expect(result.current.data).toBeUndefined();

    const conditional = renderHook(
      ({ ready }: { ready: boolean }) =>
        useStickySWR(
          () => (ready ? "/conditional" : null),
          (url: string) => Promise.resolve(url),
          {},
        ),
      { initialProps: { ready: true }, wrapper },
    );

    await waitFor(() =>
      expect(conditional.result.current.data).toBe("/conditional"),
    );
    conditional.rerender({ ready: false });
    expect(conditional.result.current.data).toBeUndefined();
  });
});

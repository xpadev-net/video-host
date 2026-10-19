import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";
import { useStickySWR } from "../src/hooks/useStickySWR";

describe("useStickySWR", () => {
  it("keeps the last successful result while the next key loads", async () => {
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
    expect(result.current.data).toBe("/first");

    await waitFor(() => expect(result.current.data).toBe("/second"));

    rerender({ key: null });
    expect(result.current.data).toBe("/second");
  });
});

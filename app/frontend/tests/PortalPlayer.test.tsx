import { act, cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentMovieAtom, DurablePlayerAtom } from "@/atoms/Player";

const lifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: "/movies/m1" } }),
}));
vi.mock("@/components/Player/DesktopPlayer", async () => {
  const React = await import("react");
  return {
    DesktopPlayer: () => {
      React.useEffect(() => {
        lifecycle.mounts += 1;
        return () => {
          lifecycle.unmounts += 1;
        };
      }, []);
      return <div data-testid="desktop-player" />;
    },
  };
});
vi.mock("@/components/Player/MobilePlayer", () => ({
  MobilePlayer: () => <div data-testid="mobile-player" />,
}));

import { PortalPlayer } from "@/components/Player/PortalPlayer";

const movie = { id: "m1", title: "Movie" } as never;

describe("PortalPlayer", () => {
  beforeEach(() => {
    lifecycle.mounts = 0;
    lifecycle.unmounts = 0;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the player mounted while it moves between targets and while none exists", async () => {
    const store = createStore();
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);

    render(
      <Provider store={store}>
        <PortalPlayer />
      </Provider>,
    );
    // No movie yet: nothing is rendered.
    expect(screen.queryByTestId("desktop-player")).toBeNull();

    await act(async () => {
      store.set(CurrentMovieAtom, movie);
    });
    // A movie but no target (e.g. a route is loading): the player is NOT
    // destroyed, it lives in the hidden holder.
    const player = await screen.findByTestId("desktop-player");
    expect(lifecycle.mounts).toBe(1);

    await act(async () => {
      store.set(DurablePlayerAtom, { target: first, className: "a" });
    });
    expect(first.contains(player)).toBe(true);

    // The route changes: the first target disappears, the next one appears
    // later. The player must survive the gap and the move.
    await act(async () => {
      store.set(DurablePlayerAtom, null);
    });
    expect(screen.getByTestId("desktop-player")).toBe(player);
    expect(first.contains(player)).toBe(false);

    await act(async () => {
      store.set(DurablePlayerAtom, { target: second });
    });
    expect(second.contains(player)).toBe(true);

    expect(lifecycle.mounts).toBe(1);
    expect(lifecycle.unmounts).toBe(0);
  });
});

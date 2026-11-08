import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectedProfileIdAtom } from "@/atoms/SelectedAccount";
import { ProfileSelectionGate } from "@/components/ProfileSelectionGate";

const mocks = vi.hoisted(() => ({
  session: true,
  pending: false,
  profiles: [{ id: "profile-a" }],
  error: false,
  loading: false,
  pathname: "/",
  mutate: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: mocks.session ? { user: { id: "account-a" } } : null,
      isPending: mocks.pending,
    }),
  },
}));
vi.mock("@/hooks/useProfiles", () => ({
  useProfiles: () => ({
    data: mocks.error ? undefined : mocks.profiles,
    error: mocks.error,
    isLoading: mocks.loading,
    mutate: mocks.mutate,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => mocks.pathname,
}));
vi.mock("@/components/Dashboard/AccountSwitcher", () => ({
  AccountSwitcher: () => <div>プロフィール選択・作成フォーム</div>,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.mutate.mockResolvedValue([]);
  mocks.session = true;
  mocks.pending = false;
  mocks.profiles = [{ id: "profile-a" }];
  mocks.error = false;
  mocks.loading = false;
  mocks.pathname = "/";
});
function setup(profileId: string | null = null) {
  const store = createStore();
  store.set(selectedProfileIdAtom, profileId);
  render(
    <Provider store={store}>
      <ProfileSelectionGate>
        <div>コンテンツ</div>
      </ProfileSelectionGate>
    </Provider>,
  );
  return store;
}
describe("explicit device profile selection", () => {
  it("requires choosing a profile even when there is only one", () => {
    const store = setup();
    expect(
      screen.getByRole("heading", { name: "利用するプロフィールを選択" }),
    ).toBeTruthy();
    expect(screen.queryByText("コンテンツ")).toBeNull();
    expect(store.get(selectedProfileIdAtom)).toBeNull();
    act(() => store.set(selectedProfileIdAtom, "profile-a"));
    expect(screen.getByText("コンテンツ")).toBeTruthy();
  });
  it("uses a valid remembered selection", () => {
    setup("profile-a");
    expect(screen.getByText("コンテンツ")).toBeTruthy();
  });
  it("clears deleted or foreign profiles only after refreshing", async () => {
    const store = setup("deleted-profile");
    expect(store.get(selectedProfileIdAtom)).toBe("deleted-profile");
    await waitFor(() => expect(store.get(selectedProfileIdAtom)).toBeNull());
    expect(screen.queryByText("コンテンツ")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "利用するプロフィールを選択" }),
    ).toBeTruthy();
  });
  it("preserves a profile selected in another tab when the cached list is stale", async () => {
    mocks.mutate.mockResolvedValue([
      { id: "profile-a" },
      { id: "new-profile" },
    ]);
    const store = setup("new-profile");
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(store.get(selectedProfileIdAtom)).toBe("new-profile");
  });
  it("preserves a remembered selection when verification fails", async () => {
    mocks.mutate.mockRejectedValue(new Error("Network unavailable"));
    const store = setup("unknown-profile");
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(store.get(selectedProfileIdAtom)).toBe("unknown-profile");
  });
  it("does not clear a newer selection when an old refresh finishes", async () => {
    let finish!: (profiles: { id: string }[]) => void;
    mocks.mutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const store = setup("unknown-profile");
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce());
    act(() => store.set(selectedProfileIdAtom, "profile-a"));
    await act(async () => {
      finish([]);
    });
    expect(store.get(selectedProfileIdAtom)).toBe("profile-a");
    expect(screen.getByText("コンテンツ")).toBeTruthy();
  });
  it("offers creation for an account with zero profiles", () => {
    mocks.profiles = [];
    setup();
    expect(
      screen.getByRole("heading", { name: "プロフィールを作成" }),
    ).toBeTruthy();
    expect(screen.getByText("プロフィール選択・作成フォーム")).toBeTruthy();
  });
  it("keeps the selection when loading fails", () => {
    mocks.error = true;
    const store = setup("profile-a");
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(store.get(selectedProfileIdAtom)).toBe("profile-a");
    expect(screen.queryByText("コンテンツ")).toBeNull();
  });
  it("allows anonymous browsing without profile selection", () => {
    mocks.session = false;
    setup();
    expect(screen.getByText("コンテンツ")).toBeTruthy();
  });
});

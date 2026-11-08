import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
  uploadSelectionLockedAtom,
} from "@/atoms/SelectedAccount";
import { AccountSwitcher } from "@/components/Dashboard/AccountSwitcher";

const mocks = vi.hoisted(() => ({
  role: "ADMIN",
  mutate: vi.fn(),
  create: vi.fn(),
  profiles: [] as { id: string; name: string; username: string }[],
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "account-a" } } }) },
}));
vi.mock("@/hooks/useAccount", () => ({
  useAccount: () => ({
    data: { id: "account-a", name: "Account A", role: mocks.role },
  }),
}));
vi.mock("@/hooks/useProfiles", () => ({
  useProfiles: () => ({ data: mocks.profiles, mutate: mocks.mutate }),
}));
vi.mock("@/hooks/useUser", () => ({
  useSelf: () => ({ data: null, mutate: mocks.mutate }),
}));
vi.mock("@/hooks/useDashboard", () => ({
  useAccounts: () => ({
    data: [{ id: "other-account", name: "Other Account" }],
  }),
}));
vi.mock("@/lib/client", () => ({
  client: { api: { v4: { users: { profiles: { $post: mocks.create } } } } },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profiles = [];
  mocks.role = "ADMIN";
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe("profile-independent account navigation", () => {
  it("lets an administrator with zero profiles reach account management", () => {
    mocks.role = "ADMIN";
    render(
      <Provider store={createStore()}>
        <AccountSwitcher />
      </Provider>,
    );
    expect(
      screen.getByRole("link", { name: "アカウント管理" }).getAttribute("href"),
    ).toBe("/dashboard/admin/accounts");
  });
  it("does not show account administration to ordinary accounts", () => {
    mocks.role = "USER";
    render(
      <Provider store={createStore()}>
        <AccountSwitcher />
      </Provider>,
    );
    expect(screen.queryByRole("link", { name: "アカウント管理" })).toBeNull();
  });
  it("releases creation progress after selecting another existing profile", async () => {
    mocks.role = "USER";
    mocks.profiles = [
      { id: "profile-a", name: "A", username: "aaa" },
      { id: "profile-b", name: "B", username: "bbb" },
    ];
    let finish!: (value: unknown) => void;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const store = createStore();
    store.set(selectedProfileIdAtom, "profile-a");
    render(
      <Provider store={store}>
        <AccountSwitcher />
      </Provider>,
    );
    fireEvent.change(screen.getByLabelText("プロフィール表示名"), {
      target: { value: "New" },
    });
    fireEvent.change(screen.getByLabelText("プロフィールユーザー名"), {
      target: { value: "newprofile" },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロフィールを追加" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("プロフィール"), {
      target: { value: "profile-b" },
    });
    await act(async () => {
      finish({
        ok: true,
        json: async () => ({
          data: { id: "created-profile", name: "New", username: "newprofile" },
        }),
      });
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "プロフィールを追加" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(store.get(selectedProfileIdAtom)).toBe("profile-b");
  });
  it("blocks account and profile changes while upload state is active", () => {
    mocks.profiles = [{ id: "profile-a", name: "A", username: "aaa" }];
    const store = createStore();
    store.set(selectedProfileIdAtom, "profile-a");
    store.set(uploadSelectionLockedAtom, true);
    render(
      <Provider store={store}>
        <AccountSwitcher />
      </Provider>,
    );
    expect(screen.getByLabelText("プロフィール").hasAttribute("disabled")).toBe(
      true,
    );
    expect(
      screen.getByLabelText("表示アカウント").hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("表示アカウント"), {
      target: { value: "other-account" },
    });
    expect(store.get(selectedAccountIdAtom)).toBeNull();
    expect(store.get(selectedProfileIdAtom)).toBe("profile-a");
  });
  it("does not select a created profile after its switcher has unmounted", async () => {
    mocks.role = "USER";
    mocks.profiles = [{ id: "profile-a", name: "A", username: "aaa" }];
    let finish!: (value: unknown) => void;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const store = createStore();
    store.set(selectedProfileIdAtom, "profile-a");
    const view = render(
      <Provider store={store}>
        <AccountSwitcher />
      </Provider>,
    );
    fireEvent.change(screen.getByLabelText("プロフィール表示名"), {
      target: { value: "New" },
    });
    fireEvent.change(screen.getByLabelText("プロフィールユーザー名"), {
      target: { value: "newprofile" },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロフィールを追加" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    view.unmount();
    store.set(selectedAccountIdAtom, "other-account");
    store.set(selectedProfileIdAtom, "other-profile");
    await act(async () => {
      finish({
        ok: true,
        json: async () => ({
          data: { id: "created-profile", name: "New", username: "newprofile" },
        }),
      });
    });
    expect(store.get(selectedProfileIdAtom)).toBe("other-profile");
    expect(store.get(selectedAccountIdAtom)).toBe("other-account");
  });
});

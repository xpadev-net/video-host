import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { useInvitations } from "@/hooks/useInvitations";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "administrator" } } }),
  },
}));
vi.mock("@/lib/client", () => ({
  client: { api: { v4: { invitations: { $get: mocks.get } } } },
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
beforeEach(() => vi.clearAllMocks());
function setup(profileId: string | null) {
  const store = createStore();
  store.set(selectedAccountIdAtom, null);
  store.set(selectedProfileIdAtom, profileId);
  const cache = new Map();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <SWRConfig
        value={{
          provider: () => cache,
          dedupingInterval: 0,
          shouldRetryOnError: false,
        }}
      >
        {children}
      </SWRConfig>
    </Provider>
  );
  return { store, ...renderHook(() => useInvitations(), { wrapper }) };
}
const response = (name: string) => ({
  ok: true,
  json: async () => ({ data: { received: [{ id: name }], sent: [] } }),
});
describe("invitation cache identity", () => {
  it("keeps a delayed previous-account response out of the selected account's list", async () => {
    let finishOwn!: (value: ReturnType<typeof response>) => void;
    let finishOther!: (value: ReturnType<typeof response>) => void;
    mocks.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOwn = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOther = resolve;
          }),
      );
    const { result, store } = setup("own-profile");
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
    expect(mocks.get.mock.calls[0][1].headers).toEqual({
      "X-Account-Id": "",
      "X-Profile-Id": "own-profile",
    });
    act(() => {
      store.set(selectedAccountIdAtom, "other-account");
      store.set(selectedProfileIdAtom, "other-profile");
    });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(mocks.get.mock.calls[1][1].headers).toEqual({
      "X-Account-Id": "other-account",
      "X-Profile-Id": "other-profile",
    });
    await act(async () => {
      finishOwn(response("own-invitation"));
    });
    expect(result.current.data).toBeUndefined();
    await act(async () => {
      finishOther(response("other-invitation"));
    });
    await waitFor(() =>
      expect(result.current.data?.received[0].id).toBe("other-invitation"),
    );
  });
  it("clears the previous list immediately when changing profiles", async () => {
    mocks.get.mockResolvedValueOnce(response("first-profile"));
    const { result, store } = setup("first-profile");
    await waitFor(() =>
      expect(result.current.data?.received[0].id).toBe("first-profile"),
    );
    mocks.get.mockImplementationOnce(() => new Promise(() => {}));
    act(() => store.set(selectedProfileIdAtom, "second-profile"));
    expect(result.current.data).toBeUndefined();
  });
  it("does not fetch before a profile has been selected", () => {
    setup(null);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

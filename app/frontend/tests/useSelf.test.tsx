import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { useSelf } from "@/hooks/useUser";

const mocks = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "administrator" } },
      isPending: false,
    }),
  },
}));
vi.mock("@/lib/client", () => ({
  client: { api: { v4: { users: { me: { $get: mocks.me } } } } },
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
beforeEach(() => vi.clearAllMocks());
const success = {
  status: 200,
  json: async () => ({
    status: "ok",
    data: { id: "new-profile", name: "New", username: "new", avatarUrl: null },
  }),
};
function setup(profileId: string | null) {
  const store = createStore();
  store.set(selectedAccountIdAtom, "administered-account");
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
  return { store, ...renderHook(() => useSelf(), { wrapper }) };
}
describe("profile validation response ownership", () => {
  it("does not erase a new selection when an old forbidden response arrives", async () => {
    let finishOld!: (response: { status: number }) => void;
    mocks.me
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce(success);
    const { result, store } = setup("deleted-profile");
    await waitFor(() => expect(mocks.me).toHaveBeenCalledTimes(1));
    act(() => store.set(selectedProfileIdAtom, "new-profile"));
    await waitFor(() => expect(result.current.data?.id).toBe("new-profile"));
    await act(async () => {
      finishOld({ status: 403 });
    });
    expect(store.get(selectedAccountIdAtom)).toBe("administered-account");
    expect(store.get(selectedProfileIdAtom)).toBe("new-profile");
    expect(result.current.data?.id).toBe("new-profile");
  });
  it("does not request a profile while none is selected", () => {
    setup(null);
    expect(mocks.me).not.toHaveBeenCalled();
  });
});

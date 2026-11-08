import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUpload } from "@/hooks/useUpload";

const mocks = vi.hoisted(() => ({
  accountId: "account-a" as string | null,
  profileId: "profile-a",
  init: vi.fn(),
  complete: vi.fn(),
  url: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "administrator" } } }),
  },
}));
vi.mock("@/lib/client", () => ({
  getSelectedAccountId: () => mocks.accountId,
  getSelectedProfileId: () => mocks.profileId,
  client: {
    api: {
      v4: {
        upload: {
          init: { $post: mocks.init },
          ":movieId": {
            complete: { $post: mocks.complete },
            url: { $post: mocks.url },
          },
        },
      },
    },
  },
}));
class UploadRequest {
  static requests: UploadRequest[] = [];
  upload = {};
  status = 0;
  onload: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    UploadRequest.requests.push(this);
  }
  open() {}
  setRequestHeader() {}
  send() {}
  abort() {
    this.onabort?.();
  }
  finish(status = 200) {
    this.status = status;
    this.onload?.();
  }
}
const file = new File(["video bytes"], "movie.mp4", { type: "video/mp4" });
beforeEach(() => {
  vi.clearAllMocks();
  UploadRequest.requests = [];
  mocks.accountId = "account-a";
  mocks.profileId = "profile-a";
  vi.stubGlobal("XMLHttpRequest", UploadRequest);
  mocks.init.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        movie: { id: "movie-a", title: "Movie A" },
        uploadUrl: "https://storage.test/upload",
      },
    }),
  });
  mocks.complete.mockResolvedValue({ ok: true });
  mocks.url.mockResolvedValue({
    ok: true,
    json: async () => ({ data: { uploadUrl: "https://storage.test/retry" } }),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("upload identity snapshot", () => {
  it.each(["account-a", null])(
    "completes with the original account %s after switching accounts",
    async (accountId) => {
      mocks.accountId = accountId;
      const { result } = renderHook(() => useUpload());
      let initialized: Awaited<ReturnType<typeof result.current.init>> = null;
      await act(async () => {
        initialized = await result.current.init(file);
      });
      expect(initialized).toMatchObject({ profileId: "profile-a", accountId });
      let operation!: Promise<boolean>;
      act(() => {
        operation = result.current.upload(
          "movie-a",
          "https://storage.test/upload",
          file,
        );
      });
      mocks.accountId = "account-b";
      mocks.profileId = "profile-b";
      let completed = false;
      await act(async () => {
        UploadRequest.requests[0].finish();
        completed = await operation;
      });
      expect(completed).toBe(true);
      expect(mocks.complete.mock.calls[0][1].headers).toEqual({
        "X-Profile-Id": "profile-a",
        "X-Account-Id": accountId ?? "",
      });
    },
  );
  it("uses the original account for a failed PUT retry and completion", async () => {
    const { result } = renderHook(() => useUpload());
    await act(async () => {
      await result.current.init(file);
    });
    let first!: Promise<boolean>;
    act(() => {
      first = result.current.upload(
        "movie-a",
        "https://storage.test/upload",
        file,
      );
    });
    await act(async () => {
      UploadRequest.requests[0].finish(500);
      await first;
    });
    mocks.accountId = "account-b";
    mocks.profileId = "profile-b";
    let retry!: Promise<boolean>;
    act(() => {
      retry = result.current.resume("movie-a", file);
    });
    await waitFor(() => expect(UploadRequest.requests).toHaveLength(2));
    await act(async () => {
      UploadRequest.requests[1].finish();
      expect(await retry).toBe(true);
    });
    const headers = {
      "X-Profile-Id": "profile-a",
      "X-Account-Id": "account-a",
    };
    expect(mocks.url.mock.calls[0][1].headers).toEqual(headers);
    expect(mocks.complete.mock.calls[0][1].headers).toEqual(headers);
  });
});

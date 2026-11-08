import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileVisibilityEditor } from "@/components/Dashboard/ProfileVisibilityEditor";

const mocks = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("@/lib/client", () => ({
  client: { api: { v4: { users: { me: { $patch: mocks.patch } } } } },
}));
vi.mock("@/components/Dashboard/ViewerManager", () => ({
  ViewerManager: () => <div>閲覧者管理</div>,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const profile = {
  id: "profile",
  name: "Profile",
  username: "profile",
  avatarUrl: null,
  visibility: "PUBLIC" as const,
};

describe("common profile visibility", () => {
  it("allows changing visibility for the initial profile too", async () => {
    mocks.patch.mockResolvedValue({ ok: true });
    const onSaved = vi.fn();
    render(
      <ProfileVisibilityEditor
        profile={profile}
        selectedProfileId="profile"
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByLabelText("プロフィール公開設定"), {
      target: { value: "PRIVATE" },
    });
    expect(screen.getByText("閲覧者管理")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "公開設定を保存" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.patch).toHaveBeenCalledWith(
      { json: { visibility: "PRIVATE" } },
      { headers: { "X-Profile-Id": "profile" } },
    );
  });
  it("targets the selected profile using the same save operation", async () => {
    mocks.patch.mockResolvedValue({ ok: true });
    render(
      <ProfileVisibilityEditor
        profile={profile}
        selectedProfileId="profile"
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "公開設定を保存" }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        { json: { visibility: "PUBLIC" } },
        { headers: { "X-Profile-Id": "profile" } },
      ),
    );
  });
});

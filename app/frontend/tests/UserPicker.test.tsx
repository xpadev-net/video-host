import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserPicker } from "@/components/UserPicker/UserPicker";
import { client } from "@/lib/client";

vi.mock("@/lib/client", () => ({
  client: {
    api: { v4: { users: { $get: vi.fn() } } },
  },
}));

const getUsers = vi.mocked(client.api.v4.users.$get);
const alice = { id: "alice", name: "Alice", username: "alice" };

describe("UserPicker", () => {
  beforeEach(() => {
    getUsers.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { items: [alice] } }),
    } as never);
  });

  afterEach(cleanup);

  it("ignores stale results and reopens after Escape", async () => {
    const onChange = vi.fn();
    render(<UserPicker selected={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "Alice" } });
    await screen.findByRole("option", { name: "Alice @alice" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");

    fireEvent.change(input, { target: { value: "Bob" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not select a user when Enter is confirming IME composition", async () => {
    const onChange = vi.fn();
    render(<UserPicker selected={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "Alice" } });
    await waitFor(() => screen.getByRole("option", { name: "Alice @alice" }));
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith([alice]);
  });
});

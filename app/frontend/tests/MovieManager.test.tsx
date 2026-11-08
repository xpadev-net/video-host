import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { MovieManager } from "@/components/Dashboard/MovieManager";

const mocks = vi.hoisted(() => ({
  movies: vi.fn(),
  addSeries: vi.fn(),
  addPlaylist: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "administrator" } } }),
  },
}));
vi.mock("@/components/Feedback/FeedbackProvider", () => ({
  useNotify: () => mocks.notify,
}));
vi.mock("@/lib/client", () => ({
  getSelectedProfileId: () =>
    JSON.parse(localStorage.getItem("dashboard-selected-profile") ?? "null"),
  client: {
    api: {
      v4: {
        movies: { $get: mocks.movies },
        series: { ":series": { movies: { $post: mocks.addSeries } } },
        playlists: { ":playlist": { movies: { $post: mocks.addPlaylist } } },
      },
    },
  },
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.movies.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        items: [{ id: "movie-b", title: "Movie B", thumbnailUrl: null }],
        pagination: { hasNext: false },
      },
    }),
  });
  mocks.addSeries.mockResolvedValue({ ok: true });
  mocks.addPlaylist.mockResolvedValue({ ok: true });
});
describe("movie selection for an administered account", () => {
  it.each(["series", "playlist"] as const)(
    "lists and adds the selected profile's videos to a %s",
    async (entityType) => {
      const store = createStore();
      store.set(selectedAccountIdAtom, "account-b");
      store.set(selectedProfileIdAtom, "profile-b");
      const onChange = vi.fn();
      render(
        <Provider store={store}>
          <MovieManager
            entityType={entityType}
            entityId="collection-b"
            movies={[]}
            onMoviesChange={onChange}
          />
        </Provider>,
      );
      await screen.findByRole("option", { name: "Movie B" });
      expect(mocks.movies).toHaveBeenCalledWith(
        {
          query: { page: "1", limit: "100", author: "profile-b", mine: "true" },
        },
        {
          headers: { "X-Profile-Id": "profile-b", "X-Account-Id": "account-b" },
        },
      );
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "movie-b" },
      });
      fireEvent.click(screen.getByRole("button", { name: "追加" }));
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith([
          {
            movie: { id: "movie-b", title: "Movie B", thumbnailUrl: undefined },
            order: 1,
          },
        ]),
      );
      const add = entityType === "series" ? mocks.addSeries : mocks.addPlaylist;
      expect(add.mock.calls[0][1].headers).toEqual({
        "X-Profile-Id": "profile-b",
        "X-Account-Id": "account-b",
      });
    },
  );
});

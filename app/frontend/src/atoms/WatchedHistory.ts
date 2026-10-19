import { atomWithStorage, createJSONStorage } from "jotai/utils";

import type {
  WatchedHistory,
  WatchedHistoryEntry,
} from "@/@types/WatchedHistory";

export const MAX_WATCHED_HISTORY_ENTRIES = 200;

const normalizeWatchedHistory = (value: unknown): WatchedHistory => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const entries = Object.entries(value).flatMap(([key, raw], index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const movie =
      item.movie && typeof item.movie === "object"
        ? (item.movie as Record<string, unknown>)
        : item;
    const movieId = typeof item.movieId === "string" ? item.movieId : key;
    const title = movie.title;
    const duration = movie.duration;
    const thumbnailUrl = movie.thumbnailUrl;
    const watched = item.watched;
    const updatedAt = item.updatedAt;

    if (
      !movieId ||
      typeof title !== "string" ||
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      typeof watched !== "number" ||
      !Number.isFinite(watched)
    ) {
      return [];
    }

    const entry: WatchedHistoryEntry = {
      movieId,
      title,
      thumbnailUrl: typeof thumbnailUrl === "string" ? thumbnailUrl : null,
      duration: Math.max(0, duration),
      watched: Math.max(0, Math.min(1, watched)),
      // Legacy entries were inserted in watch order and the old history page
      // reversed that order to show newest first. Keep that recency on migration.
      updatedAt:
        typeof updatedAt === "number" && Number.isFinite(updatedAt)
          ? updatedAt
          : item.movie
            ? index + 1
            : 0,
    };
    return [entry];
  });

  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return Object.fromEntries(
    entries
      .slice(0, MAX_WATCHED_HISTORY_ENTRIES)
      .map((entry) => [entry.movieId, entry]),
  );
};

const watchedHistoryStorage = createJSONStorage<WatchedHistory>(() => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  const getLocalStorage = () => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };

  return {
    getItem: (key) => {
      try {
        const raw = getLocalStorage()?.getItem(key);
        if (!raw) return null;
        const normalized = JSON.stringify(
          normalizeWatchedHistory(JSON.parse(raw)),
        );
        if (normalized !== raw) {
          try {
            getLocalStorage()?.setItem(key, normalized);
          } catch {
            // Keep the normalized in-memory value even if migration cannot be saved.
          }
        }
        return normalized;
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        getLocalStorage()?.setItem(key, value);
      } catch {
        // Keep the atom usable when browser storage is unavailable.
      }
    },
    removeItem: (key) => {
      try {
        getLocalStorage()?.removeItem(key);
      } catch {
        // Keep the atom usable when browser storage is unavailable.
      }
    },
  };
});

watchedHistoryStorage.subscribe = (key, callback) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    try {
      callback(
        event.newValue
          ? normalizeWatchedHistory(JSON.parse(event.newValue))
          : {},
      );
    } catch {
      callback({});
    }
  };

  try {
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  } catch {
    return undefined;
  }
};

const watchedHistoryAtom = atomWithStorage<WatchedHistory>(
  "WatchedHistory",
  {},
  watchedHistoryStorage,
);

export { normalizeWatchedHistory, watchedHistoryAtom };

import { createFileRoute, Link } from "@tanstack/react-router";
import { useAtom } from "jotai";

import { watchedHistoryAtom } from "@/atoms/WatchedHistory";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { SiteName } from "@/contexts/env";
import { time2str } from "@/libraries/time";

export const Route = createFileRoute("/_app/history")({
  head: () => ({ meta: [{ title: `履歴 - ${SiteName}` }] }),
  component: HistoryRoute,
});

function HistoryRoute() {
  const [history, setHistory] = useAtom(watchedHistoryAtom);
  const historyList = Object.values(history).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  return (
    <main className="mx-auto max-w-[1070px] p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">
          視聴履歴
        </h1>
        {historyList.length > 0 && (
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-[var(--color-sub-text)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            onClick={() => setHistory({})}
          >
            履歴をクリア
          </button>
        )}
      </div>

      {historyList.length === 0 ? (
        <p className="rounded-xl bg-[var(--color-secondary-background)] p-6 text-center text-[var(--color-sub-text)]">
          視聴履歴はありません
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {historyList.map((entry) => (
            <li key={entry.movieId}>
              <Link
                to="/movies/$movie"
                params={{ movie: entry.movieId }}
                className="flex gap-3 rounded-xl p-2 text-[var(--color-text)] no-underline hover:bg-[var(--color-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              >
                <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md bg-[var(--color-skeleton)] sm:w-56">
                  {entry.thumbnailUrl && (
                    <ImageWithFallback
                      src={entry.thumbnailUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <div
                    role="progressbar"
                    aria-label={`${entry.title}の再生位置`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(entry.watched * 100)}
                    className="absolute bottom-0 left-0 h-1 w-full bg-black/40"
                  >
                    <div
                      className="h-full bg-[var(--color-accent)]"
                      style={{ width: `${entry.watched * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                  <h2 className="line-clamp-2 text-base font-semibold sm:text-lg">
                    {entry.title}
                  </h2>
                  <p className="text-sm text-[var(--color-sub-text)]">
                    {time2str(entry.duration)} ・{" "}
                    {Math.round(entry.watched * 100)}%
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

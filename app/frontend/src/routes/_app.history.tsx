import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

import { watchedHistoryAtom } from "@/atoms/WatchedHistory";
import { MovieList } from "@/components/MovieList";
import { SiteName } from "@/contexts/env";

export const Route = createFileRoute("/_app/history")({
  head: () => ({ meta: [{ title: `履歴 - ${SiteName}` }] }),
  component: HistoryRoute,
});

function HistoryRoute() {
  const history = useAtomValue(watchedHistoryAtom);
  const historyList = Object.keys(history)
    .map((key) => history[key].movie)
    .toReversed();

  return (
    <div className="p-4 max-w-[1070px] mx-auto">
      <MovieList movies={historyList} type="column" showSeries={true} />
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { MovieList } from "@/components/MovieList";
import { SeriesPageSkeleton } from "@/components/SeriesPageSkeleton";
import { User } from "@/components/User/User";
import { SiteName } from "@/contexts/env";
import { useSeries } from "@/hooks/useSeries";

export const Route = createFileRoute("/_app/series/$series")({
  head: () => ({ meta: [{ title: SiteName }] }),
  component: SeriesRoute,
});

function SeriesRoute() {
  const { series } = Route.useParams();
  const { data, error, isLoading, mutate } = useSeries(series);

  useEffect(() => {
    if (data?.status === "ok") {
      const previousTitle = document.title;
      const title = `${data.data.title} - ${SiteName}`;
      document.title = title;
      return () => {
        if (document.title === title) document.title = previousTitle;
      };
    }
  }, [data]);

  if (isLoading && !data) return <SeriesPageSkeleton />;
  if (error && !data) {
    return (
      <LoadErrorMessage
        message="シリーズを読み込めませんでした"
        onRetry={() => void mutate()}
      />
    );
  }
  if (!data) return <SeriesPageSkeleton />;
  if (data.status !== "ok") {
    return <LoadErrorMessage message="シリーズが見つかりませんでした" />;
  }

  return (
    <div className="p-6 pt-3 max-w-[1070px] mx-auto flex flex-col gap-2">
      {error ? (
        <LoadErrorMessage
          message="シリーズを更新できませんでした"
          onRetry={() => void mutate()}
        />
      ) : null}
      <div className="sticky top-0 z-10 bg-background py-4 flex flex-col gap-2">
        <h1 className="text-2xl">{data.data.title}</h1>
        <User user={data.data.author} size="1" />
      </div>
      <div>
        <MovieList movies={data.data.movies ?? []} type="column" />
      </div>
    </div>
  );
}

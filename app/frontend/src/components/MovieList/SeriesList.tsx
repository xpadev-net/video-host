import type { FormattedSeries } from "@video-host/backend";
import type { ComponentProps, FC } from "react";
import { MovieList } from "@/components/MovieList/MovieList";

type Props = Omit<ComponentProps<typeof MovieList>, "movies"> & {
  series: FormattedSeries;
};

export const SeriesList: FC<Props> = ({ series, ...props }) => {
  const movies =
    series.movies?.map((movie) => {
      return {
        ...movie,
        series: series,
      };
    }) ?? [];
  return <MovieList movies={movies} {...props} />;
};

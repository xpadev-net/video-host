import type { FC } from "react";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { MovieCard, MovieCardSkeleton } from "@/components/Movie";
import { NoResultsMessage } from "@/components/SearchList/NoResultsMessage";
import { SearchListWrapper } from "@/components/SearchList/SearchListWrapper";
import { useMovies } from "@/hooks/useMovies";

type MovieResultProps = {
  query?: string;
  author?: string;
  grid?: boolean;
};

export const MoviesSearchList: FC<MovieResultProps> = ({
  query,
  author,
  grid,
}) => {
  const { movies, setSize, hasNext, isValidating, error, mutate } = useMovies({
    query,
    author,
  });

  if (error && movies.length === 0) {
    return (
      <LoadErrorMessage
        message="動画を読み込めませんでした"
        onRetry={() => void mutate()}
      />
    );
  }

  if (!isValidating && !hasNext && movies.length === 0) {
    return <NoResultsMessage />;
  }

  return (
    <>
      <SearchListWrapper
        hasNext={hasNext}
        isValidating={isValidating}
        setSize={setSize}
        grid={grid}
        loadingSkeleton={<MovieCardSkeleton />}
      >
        {movies.map((movie) => (
          <MovieCard
            movie={movie}
            type={grid ? "row" : "column"}
            key={movie.id}
            showSeries={true}
          />
        ))}
      </SearchListWrapper>
      {error && (
        <LoadErrorMessage
          message="動画を読み込めませんでした"
          onRetry={() => void mutate()}
        />
      )}
    </>
  );
};

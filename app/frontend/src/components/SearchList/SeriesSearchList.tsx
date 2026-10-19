import type { FC } from "react";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { NoResultsMessage } from "@/components/SearchList/NoResultsMessage";
import { SearchListWrapper } from "@/components/SearchList/SearchListWrapper";
import { SeriesCard, SeriesCardSkeleton } from "@/components/SeriesCard";
import { useSeriesListInfinite } from "@/hooks/useSeriesListInfinite";

type Props = {
  query?: string;
  author?: string;
};

export const SeriesSearchList: FC<Props> = ({ query, author }) => {
  const { series, setSize, hasNext, isValidating, error, mutate } =
    useSeriesListInfinite({ query, author });

  if (error && series.length === 0) {
    return (
      <LoadErrorMessage
        message="シリーズを読み込めませんでした"
        onRetry={() => void mutate()}
      />
    );
  }

  if (!isValidating && !hasNext && series.length === 0) {
    return <NoResultsMessage />;
  }

  return (
    <>
      <SearchListWrapper
        hasNext={hasNext}
        isValidating={isValidating}
        setSize={setSize}
        loadingSkeleton={<SeriesCardSkeleton />}
      >
        {series.map((seriesItem) => (
          <SeriesCard series={seriesItem} key={seriesItem.id} />
        ))}
      </SearchListWrapper>
      {error && (
        <LoadErrorMessage
          message="シリーズを読み込めませんでした"
          onRetry={() => void mutate()}
        />
      )}
    </>
  );
};

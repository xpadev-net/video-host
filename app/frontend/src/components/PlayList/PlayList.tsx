import { Link } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { SeriesList } from "@/components/MovieList/SeriesList";
import { findNext } from "@/components/Player/utils/findPrevNext";
import { cn } from "@/lib/utils";
import { visibility2str } from "@/utils/visibility2str";

type props = {
  data: FormattedMovie;
  className?: string;
  maxHeight?: number;
};

const PlayList = ({ data, className, maxHeight }: props) => {
  const [isOpen, setIsOpen] = useState(true);
  const next = findNext(data);

  if (!data.series) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col select-none max-h-[min(700px,50vh)] rounded-xl border border-[var(--color-quaternary-background)] overflow-hidden",
        className,
      )}
      style={
        maxHeight !== undefined ? { maxHeight: `${maxHeight}px` } : undefined
      }
    >
      <div className="shrink-0 bg-[var(--color-thirdly-background)]">
        <button
          className="flex h-[60px] w-full py-1 px-4 flex-row items-center text-left"
          onClick={() => setIsOpen((pv) => !pv)}
          type="button"
          aria-label={isOpen ? "Collapse playlist" : "Expand playlist"}
          aria-expanded={isOpen}
        >
          <div className="flex flex-col flex-1">
            <div className="flex flex-col leading-[25px] flex-1 align-middle justify-center">
              {next && !isOpen && (
                <span className="leading-[25px] truncate">
                  次: {next.title}
                </span>
              )}
              <span
                className={cn(
                  "truncate",
                  isOpen || !next
                    ? "text-[var(--color-text)] leading-[25px]"
                    : "text-xs text-[var(--color-sub-text)] leading-6",
                )}
              >
                {data.series.title}
              </span>
            </div>
          </div>
          {isOpen ? (
            <ChevronUp aria-hidden="true" />
          ) : (
            <ChevronDown aria-hidden="true" />
          )}
        </button>
        {(isOpen || !next) && (
          <div className="px-4 pb-2 flex flex-row justify-start text-[var(--color-sub-text)]">
            {data.series.visibility !== "PUBLIC" && (
              <>
                <span className="text-xs leading-6 truncate">
                  {visibility2str(data.series.visibility)}
                </span>
                ・
              </>
            )}
            <Link to="/users/$user" params={{ user: data.series.author.id }}>
              <span className="text-xs leading-6 truncate hover:underline">
                {data.series.author.name}
              </span>
            </Link>
          </div>
        )}
      </div>
      {isOpen && data.series && (
        <SeriesList
          series={data.series}
          type={"minColumn"}
          active={data.id}
          className="border-t border-[var(--color-quaternary-background)] overflow-y-scroll"
        />
      )}
    </div>
  );
};

export { PlayList };

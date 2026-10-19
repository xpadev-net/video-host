import { useNavigate } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import { SkipBack, SkipForward } from "lucide-react";
import type { MouseEvent } from "react";
import { findNext, findPrev } from "@/components/Player/utils/findPrevNext";

type props = {
  className?: string;
  type: "prev" | "next";
  data: FormattedMovie;
};

const PrevNextButton = ({ className, type, data }: props) => {
  const navigate = useNavigate();

  const item = type === "prev" ? findPrev(data) : findNext(data);

  if (!item) return null;
  const onPrevClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    void navigate({ to: "/movies/$movie", params: { movie: item.id } });
  };
  return (
    <button
      type="button"
      onClick={onPrevClick}
      className={className}
      aria-label={type === "prev" ? "前の動画" : "次の動画"}
    >
      {type === "prev" ? (
        <SkipBack aria-hidden="true" />
      ) : (
        <SkipForward aria-hidden="true" />
      )}
    </button>
  );
};

export { PrevNextButton };

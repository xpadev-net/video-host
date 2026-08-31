import { useNavigate } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import type { MouseEvent } from "react";
import { MdSkipNext, MdSkipPrevious } from "react-icons/md";
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
    <button type="button" onClick={onPrevClick} className={className}>
      {type === "prev" ? <MdSkipPrevious /> : <MdSkipNext />}
    </button>
  );
};

export { PrevNextButton };

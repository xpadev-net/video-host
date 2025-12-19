import { useSetAtom } from "jotai";
import { Maximize2, X } from "lucide-react";
import { useRouter } from "next/router";
import type { FilteredMovie } from "@/@types/v4Api";
import { CurrentMovieAtom } from "@/atoms/Player";
import { cn } from "@/lib/utils";
import { PlayPauseButton } from "../../Shared/Controller/PlayPauseButton";
import { Slider } from "./Slider";

type props = {
  data: FilteredMovie;
  className?: string;
  isPipMode?: boolean;
  isHovering?: boolean;
};

export const PiPController = ({ data, className, isHovering }: props) => {
  const setCurrentMovie = useSetAtom(CurrentMovieAtom);
  const router = useRouter();
  const handleClosePip = () => {
    setCurrentMovie(null);
  };

  const handleBackToMovie = () => {
    void router.push(`/movies/${data.id}`);
  };
  return (
    <button
      className={cn(
        "absolute top-0 left-0 w-full h-full text-white z-10",
        className,
      )}
      aria-label="Video player controls"
      type="button"
    >
      <div
        className={cn(
          "absolute top-0 left-0 w-full h-full grid items-center justify-center",
          isHovering ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleBackToMovie();
          }}
          className="w-10 h-10 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white z-10 absolute top-2 left-2"
          aria-label="Back to movie page"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClosePip();
          }}
          className="w-10 h-10 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white z-10 absolute top-2 right-2"
          aria-label="Close PiP player"
        >
          <X className="w-5 h-5" />
        </button>
        <PlayPauseButton className="w-12 h-12 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white z-10" />
      </div>
      <Slider className="absolute bottom-0 left-1 right-1 h-4 w-auto" />
    </button>
  );
};

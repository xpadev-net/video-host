import { useSetAtom } from "jotai";
import { Maximize2, X } from "lucide-react";
import { useRouter } from "next/router";
import type { FilteredMovie } from "@/@types/v4Api";
import { CurrentMovieAtom, VideoMetadataAtom } from "@/atoms/Player";
import { cn } from "@/lib/utils";
import { Slider } from "./Slider";

type props = {
  data: FilteredMovie;
  isHovering: boolean;
};

const PiPController = ({ data, isHovering }: props) => {
  const _setMetadata = useSetAtom(VideoMetadataAtom);
  const setCurrentMovie = useSetAtom(CurrentMovieAtom);
  const router = useRouter();
  if (!data) return null;

  const handleClosePip = () => {
    setCurrentMovie(null);
  };

  const handleBackToMovie = () => {
    void router.push(`/movies/${data.id}`);
  };

  return (
    <button
      className={`absolute top-0 left-0 w-full h-full text-white z-10`}
      aria-label="Video player controls"
      type="button"
    >
      <div
        className={cn(
          "absolute top-0 left-0 w-full h-full bg-black/70 flex items-center justify-center text-white z-0 transition-opacity duration-250 ease-in-out",
          isHovering
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClosePip();
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white z-10"
          aria-label="Close PiP player"
        >
          <X className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleBackToMovie();
          }}
          className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white z-10"
          aria-label="Back to movie page"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>
      <Slider className="absolute bottom-0 left-0 w-full h-4 z-10" />
    </button>
  );
};

export { PiPController };

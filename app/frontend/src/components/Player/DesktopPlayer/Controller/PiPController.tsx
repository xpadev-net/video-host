import { useNavigate } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import { useSetAtom } from "jotai";
import { Maximize2, X } from "lucide-react";
import { CurrentMovieAtom, VideoMetadataAtom } from "@/atoms/Player";
import { cn } from "@/lib/utils";
import { Slider } from "./Slider";

type props = {
  data: FormattedMovie;
  isHovering: boolean;
};

const PiPController = ({ data, isHovering }: props) => {
  const _setMetadata = useSetAtom(VideoMetadataAtom);
  const setCurrentMovie = useSetAtom(CurrentMovieAtom);
  const navigate = useNavigate();
  if (!data) return null;

  const handleClosePip = () => {
    setCurrentMovie(null);
  };

  const handleBackToMovie = () => {
    void navigate({ to: "/movies/$movie", params: { movie: data.id } });
  };

  return (
    <fieldset
      className="absolute top-0 left-0 w-full h-full min-w-0 border-0 p-0 text-white z-10"
      aria-label="Video player controls"
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
    </fieldset>
  );
};

export { PiPController };

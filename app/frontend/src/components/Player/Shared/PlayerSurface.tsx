import type { FormattedMovie } from "@video-host/backend";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

import { LoadingIcon } from "@/assets/LoadingIcon";
import { PlayerStateAtom, VideoRefAtom, WrapperRefAtom } from "@/atoms/Player";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { KeyboardHandler } from "@/components/Player/Shared/KeyboardHandler";
import { MediaSessionHandler } from "@/components/Player/Shared/MediaSessionHandler";
import { PlayerStatusDisplay } from "@/components/Player/Shared/PlayerStatusDisplay";
import { Video } from "@/components/Player/Shared/Video";
import { usePlayerAfk } from "@/hooks/usePlayerAfk";
import { cn } from "@/lib/utils";

import { Controller as DesktopController } from "../DesktopPlayer/Controller";
import { Controller as MobileController } from "../MobilePlayer/Controller";

type PlayerSurfaceProps = {
  className?: string;
  data: FormattedMovie;
  id: string;
  isPipMode?: boolean;
  variant: "desktop" | "mobile";
};

export function PlayerSurface({
  className,
  data,
  id,
  isPipMode = false,
  variant,
}: PlayerSurfaceProps) {
  const setVideoAtom = useSetAtom(VideoRefAtom);
  const setWrapperAtom = useSetAtom(WrapperRefAtom);
  const state = useAtomValue(PlayerStateAtom);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { isAfk, showControls, toggleControls } = usePlayerAfk();
  const isInactive = isAfk && !state.paused && !state.isSetting;
  const isMobile = variant === "mobile";

  useEffect(() => {
    setVideoAtom(videoRef.current);
    setWrapperAtom(wrapperRef.current);
  }, [setVideoAtom, setWrapperAtom]);

  const togglePlayback = () => {
    if (videoRef.current?.paused) {
      void videoRef.current.play();
    } else {
      videoRef.current?.pause();
    }
  };

  return (
    <div
      className={cn(
        "relative h-auto w-full overflow-hidden bg-black",
        state.isFullscreen &&
          (isMobile
            ? "fixed left-0 top-0 z-[20000] h-dvh w-screen"
            : "fixed left-0 top-0 z-20000 h-screen w-screen"),
        isInactive && "cursor-none",
        className,
      )}
      onPointerMove={isMobile ? undefined : showControls}
      ref={wrapperRef}
      id={id}
    >
      {/* A div, not a <button>: the video and overlays inside would otherwise be
          nested in an interactive element. It has no native Space/Enter
          activation, so onKeyDown below is the only path and a key press can
          never toggle twice. */}
      {/* biome-ignore lint/a11y/useSemanticElements: the surface wraps a <video>, which a <button> may not contain */}
      <div
        data-player-surface
        role="button"
        tabIndex={0}
        className="relative block h-auto w-full overflow-hidden bg-black"
        onClick={isMobile ? toggleControls : togglePlayback}
        onKeyDown={(e) => {
          // What a native button does on Enter and Space: run the click
          // action. Handled here (and kept from the window-level shortcuts)
          // so it also works in PiP, where there is no KeyboardHandler, and
          // behaves the same as a click on mobile.
          if (e.target !== e.currentTarget) return;
          if (e.key !== "Enter" && e.code !== "Space") return;
          e.preventDefault();
          e.stopPropagation();
          if (isMobile) toggleControls();
          else togglePlayback();
        }}
        aria-label={
          isMobile
            ? "Show or hide video controls"
            : state.paused
              ? "Play video"
              : "Pause video"
        }
      >
        {state.isLoading && data && (
          <>
            <div
              className={cn(
                "absolute inset-0 grid h-full w-full place-items-center bg-black/50",
                isMobile ? "z-10" : "pointer-events-none z-20",
              )}
            >
              <LoadingIcon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            {data.thumbnailUrl && (
              <ImageWithFallback
                src={data.thumbnailUrl}
                width={isMobile ? 360 : 720}
                height={isMobile ? 240 : 480}
                alt=""
                loading="eager"
                className={cn(
                  "absolute left-0 top-0 h-full w-full",
                  isMobile ? "z-0 object-cover" : "z-10",
                )}
              />
            )}
          </>
        )}
        <div
          className={cn(
            "relative mx-auto aspect-video h-full",
            isMobile && "max-h-[calc(100dvh-104px)]",
            state.isFullscreen &&
              (isMobile
                ? "max-h-dvh max-w-screen"
                : "max-h-screen max-w-[100vw]"),
          )}
        >
          <Video
            className={cn(
              "absolute left-0 top-0 z-[1] h-full w-full",
              state.isFullscreen && isMobile && "max-h-dvh max-w-screen",
            )}
            videoRef={videoRef}
            movie={data}
          />
          <PlayerStatusDisplay />
        </div>
      </div>
      {/* Outside the role="button" surface: its descendants are presentational
          for assistive technology, so an alert inside it would not be announced. */}
      {state.error && (
        <div
          role="alert"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-4 text-center text-sm text-white"
        >
          {state.error}
        </div>
      )}
      {isMobile ? (
        <MobileController
          className="z-10"
          data={data}
          isPipMode={isPipMode}
          isHovering={!isAfk}
        />
      ) : (
        <DesktopController
          data={data}
          isPipMode={isPipMode}
          isHovering={!isInactive}
        />
      )}
      {!isPipMode && <KeyboardHandler data={data} />}
      <MediaSessionHandler data={data} />
    </div>
  );
}

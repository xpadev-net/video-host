import { useAtomValue, useSetAtom } from "jotai";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { FilteredMovie } from "@/@types/v4Api";
import { LoadingIcon } from "@/assets/LoadingIcon";
import {
  PlayerConfigAtom,
  PlayerStateAtom,
  VideoRefAtom,
  WrapperRefAtom,
} from "@/atoms/Player";
import { CommentCanvas } from "@/components/Player/Shared/CommentCanvas";
import { KeyboardHandler } from "@/components/Player/Shared/KeyboardHandler";
import { MediaSessionHandler } from "@/components/Player/Shared/MediaSessionHandler";
import { PlayerStatusDisplay } from "@/components/Player/Shared/PlayerStatusDisplay";
import { Video } from "@/components/Player/Shared/Video";
import { EnableComments } from "@/contexts/env";
import { cn } from "@/lib/utils";
import { Controller } from "./Controller";

type props = {
  className?: string;
  data: FilteredMovie;
  id: string;
  isPipMode?: boolean;
};

const DesktopPlayer = ({ className, data, id, isPipMode = false }: props) => {
  const setVideoAtom = useSetAtom(VideoRefAtom);
  const setWrapperAtom = useSetAtom(WrapperRefAtom);
  const { isPipEnable, isNiconicommentsEnable } =
    useAtomValue(PlayerConfigAtom);
  const wrapperRef = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isAfk, setIsAfk] = useState(false);
  const afkTimeout = useRef<number>(-1);
  const state = useAtomValue(PlayerStateAtom);
  const isInactive = isAfk && !state.paused && !state.isSetting;

  const onPipPause = () => {
    void (async () => {
      if (videoRef.current?.paused) {
        await videoRef.current?.play();
      } else {
        videoRef.current?.pause();
      }
      await pipVideoRef.current?.play();
    })();
  };

  useEffect(() => {
    setIsAfk(false);
    clearTimeout(afkTimeout.current);
    afkTimeout.current = window.setTimeout(() => {
      setIsAfk(true);
    }, 3000);
    return () => {
      clearTimeout(afkTimeout.current);
    };
  }, []);

  useEffect(() => {
    setVideoAtom(videoRef.current);
    setWrapperAtom(wrapperRef.current);
  }, [setVideoAtom, setWrapperAtom]);

  const onMouseMove = () => {
    window.clearTimeout(afkTimeout.current);
    setIsAfk(false);
    afkTimeout.current = window.setTimeout(() => {
      setIsAfk(true);
    }, 3000);
  };

  const togglePlayerState = () => {
    if (videoRef.current?.paused) {
      void videoRef.current?.play();
    } else {
      videoRef.current?.pause();
    }
  };

  return (
    <button
      className={cn(
        "relative h-auto w-full overflow-hidden bg-black",
        state.isFullscreen && "fixed left-0 top-0 w-screen h-screen z-20000",
        isInactive && "cursor-none",
        className,
      )}
      onMouseMove={onMouseMove}
      onClick={togglePlayerState}
      type="button"
      tabIndex={0}
      aria-label={state.paused ? "Play video" : "Pause video"}
      ref={wrapperRef}
      id={id}
    >
      {state.isLoading && data && (
        <>
          <div
            className={
              "absolute z-20 left-0 top-0 w-full h-full bg-black/50 grid place-items-center pointer-events-none"
            }
          >
            <LoadingIcon className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          {data.thumbnailUrl && (
            <Image
              src={data.thumbnailUrl}
              width={720}
              height={480}
              alt={""}
              className={"absolute z-10 left-0 top-0 w-full h-full"}
            />
          )}
        </>
      )}
      <div
        className={cn(
          "relative aspect-video h-full mx-auto",
          state.isFullscreen && "max-w-[100vw] max-h-screen",
        )}
      >
        {isNiconicommentsEnable && EnableComments && !isPipMode && (
          <CommentCanvas
            key={data?.id}
            url={data?.id}
            className="absolute w-full h-full z-2 pointer-events-none object-contain"
            videoRef={videoRef.current}
            pipVideoRef={pipVideoRef.current}
          />
        )}
        <Video
          className="absolute w-full h-full z-1"
          videoRef={videoRef}
          movie={data}
        />
        <video
          className={cn(
            "absolute w-full h-full",
            isPipEnable && EnableComments ? "z-3" : "-z-1",
          )}
          ref={pipVideoRef}
          autoPlay={true}
          muted={true}
          onPause={onPipPause}
        />
        <PlayerStatusDisplay />
      </div>
      <Controller data={data} isPipMode={isPipMode} isHovering={!isInactive} />
      {!isPipMode && <KeyboardHandler data={data} />}
      <MediaSessionHandler data={data} />
    </button>
  );
};

export { DesktopPlayer };

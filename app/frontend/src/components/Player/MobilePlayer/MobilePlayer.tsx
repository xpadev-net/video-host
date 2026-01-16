import type { FormattedMovie } from "@video-host/backend";
import { useAtomValue, useSetAtom } from "jotai";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { LoadingIcon } from "@/assets/LoadingIcon";
import {
  PlayerConfigAtom,
  PlayerStateAtom,
  VideoRefAtom,
  WrapperRefAtom,
} from "@/atoms/Player";
import { Controller } from "@/components/Player/MobilePlayer/Controller";
import { CommentCanvas } from "@/components/Player/Shared/CommentCanvas";
import { KeyboardHandler } from "@/components/Player/Shared/KeyboardHandler";
import { MediaSessionHandler } from "@/components/Player/Shared/MediaSessionHandler";
import { PlayerStatusDisplay } from "@/components/Player/Shared/PlayerStatusDisplay";
import { Video } from "@/components/Player/Shared/Video";
import { EnableComments } from "@/contexts/env";
import { cn } from "@/lib/utils";

type props = {
  className?: string;
  data: FormattedMovie;
  id: string;
  isPipMode?: boolean;
};

const MobilePlayer = ({ className, data, id, isPipMode = false }: props) => {
  const state = useAtomValue(PlayerStateAtom);
  const { isPipEnable, isNiconicommentsEnable } =
    useAtomValue(PlayerConfigAtom);
  const wrapperRef = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const setVideoAtom = useSetAtom(VideoRefAtom);
  const setWrapperAtom = useSetAtom(WrapperRefAtom);
  const [isAfk, setIsAfk] = useState(false);
  const afkTimeout = useRef<number>(-1);
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

  const toggleAfk = () => {
    setIsAfk((pv) => !pv);
  };

  useEffect(() => {
    setVideoAtom(videoRef.current);
    setWrapperAtom(wrapperRef.current);
  }, [setVideoAtom, setWrapperAtom]);

  return (
    <button
      className={cn(
        "relative h-auto w-full overflow-hidden bg-black",
        state.isFullscreen && "fixed left-0 top-0 w-screen h-dvh z-[20000]",
        isInactive && "cursor-none",
        className,
      )}
      onClick={toggleAfk}
      ref={wrapperRef}
      type="button"
      tabIndex={0}
      aria-label={state.paused ? "Play video" : "Pause video"}
      id={id}
    >
      {state.isLoading && data && (
        <>
          <div className="absolute inset-0 w-full h-full bg-black/50 z-10">
            <LoadingIcon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          {data.thumbnailUrl && (
            <Image
              src={data.thumbnailUrl}
              width={360}
              height={240}
              alt={""}
              className="absolute inset-0 w-full h-full z-0"
            />
          )}
        </>
      )}
      <div
        className={cn(
          "aspect-video h-full mx-auto relative max-h-[calc(100dvh-104px)]",
          state.isFullscreen && "max-w-screen max-h-dvh",
        )}
      >
        {isNiconicommentsEnable && EnableComments && !isPipMode && (
          <CommentCanvas
            key={data?.id}
            url={data?.id}
            className={cn(
              "absolute inset-0 w-full h-full z-[2] pointer-events-none object-contain",
              state.isFullscreen && "max-w-screen max-h-dvh",
            )}
            videoRef={videoRef.current}
            pipVideoRef={pipVideoRef.current}
          />
        )}
        <Video
          className={cn(
            "absolute inset-0 w-full h-full z-[1]",
            state.isFullscreen && "max-w-screen max-h-dvh",
          )}
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
      <Controller
        className={"z-10"}
        data={data}
        isPipMode={isPipMode}
        isHovering={!isAfk}
      />
      {!isPipMode && <KeyboardHandler data={data} />}
      <MediaSessionHandler data={data} />
    </button>
  );
};

export { MobilePlayer };

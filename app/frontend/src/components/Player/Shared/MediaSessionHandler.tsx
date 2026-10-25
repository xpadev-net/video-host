import { useNavigate } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import { useAtomValue } from "jotai";
import { type FC, useEffect, useMemo } from "react";
import { VideoRefAtom } from "@/atoms/Player";
import { SEEK_SECONDS } from "@/components/Player/constants";
import { findNext, findPrev } from "@/components/Player/utils/findPrevNext";

type Props = {
  data: FormattedMovie;
};

const MediaSessionHandler: FC<Props> = ({ data }) => {
  const videoRef = useAtomValue(VideoRefAtom);
  const navigate = useNavigate();

  const next = useMemo(() => findNext(data), [data]);
  const prev = useMemo(() => findPrev(data), [data]);

  const mediaSessionHandler: {
    [key: string]: MediaSessionActionHandler | null;
  } = useMemo(
    () => ({
      seekbackward: () => {
        if (!videoRef) return;
        const time = videoRef.currentTime - SEEK_SECONDS;
        if (time < 0) {
          videoRef.currentTime = 0;
        } else {
          videoRef.currentTime -= SEEK_SECONDS;
        }
      },
      seekforward: () => {
        if (!videoRef) return;
        const time = videoRef.currentTime + SEEK_SECONDS;
        if (time > videoRef.duration) {
          videoRef.currentTime = videoRef.duration;
        } else {
          videoRef.currentTime += SEEK_SECONDS;
        }
      },
      nexttrack: next
        ? () => {
            if (!next) return;
            void navigate({
              to: "/movies/$movie",
              params: { movie: next.id },
            });
          }
        : null,
      previoustrack: prev
        ? () => {
            if (!prev) return;
            void navigate({
              to: "/movies/$movie",
              params: { movie: prev.id },
            });
          }
        : null,
    }),
    [videoRef, next, prev, navigate],
  );

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    if (!data || typeof MediaMetadata === "undefined") {
      session.metadata = null;
      return;
    }
    session.metadata = new MediaMetadata({
      title: data.title,
      artist: data.series?.title,
      artwork: data.thumbnailUrl
        ? [
            {
              src: data.thumbnailUrl,
              sizes: "256x256",
              type: "image/jpeg",
            },
          ]
        : [],
    });
    for (const key of Object.keys(mediaSessionHandler)) {
      const handler = mediaSessionHandler[key];
      try {
        session.setActionHandler(key as MediaSessionAction, handler);
      } catch {
        // Some browsers implement only a subset of Media Session actions.
      }
    }
    return () => {
      session.metadata = null;
      for (const key of Object.keys(mediaSessionHandler)) {
        try {
          session.setActionHandler(key as MediaSessionAction, null);
        } catch {
          // Ignore unsupported actions while cleaning up.
        }
      }
    };
  }, [data, mediaSessionHandler]);

  useEffect(() => {
    if (!videoRef) return;
    if (!("mediaSession" in navigator)) return;
    const handler = () => {
      const session = navigator.mediaSession;
      const duration = videoRef.duration;
      if (
        !session.setPositionState ||
        !Number.isFinite(duration) ||
        duration <= 0
      )
        return;
      const position = videoRef.currentTime;
      const playbackRate = videoRef.playbackRate;
      if (
        !Number.isFinite(position) ||
        !Number.isFinite(playbackRate) ||
        playbackRate <= 0
      )
        return;
      try {
        session.setPositionState({
          duration,
          position: Math.max(0, Math.min(duration, position)),
          playbackRate,
        });
      } catch {
        // Invalid media state can be rejected by the browser.
      }
    };
    videoRef.addEventListener("timeupdate", handler);
    return () => {
      videoRef.removeEventListener("timeupdate", handler);
    };
  }, [videoRef]);

  return null;
};

export { MediaSessionHandler };

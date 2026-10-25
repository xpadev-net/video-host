import { useNavigate } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import Hls from "hls.js";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AudioTrackIdAtom,
  AudioTracksAtom,
  HlsRefAtom,
  PlayerConfigAtom,
  PlayerMutedAtom,
  PlayerPlaybackRateAtom,
  PlayerStateAtom,
  PlayerVolumeAtom,
  VideoMetadataAtom,
} from "@/atoms/Player";
import {
  MAX_WATCHED_HISTORY_ENTRIES,
  watchedHistoryAtom,
} from "@/atoms/WatchedHistory";
import { findNext } from "@/components/Player/utils/findPrevNext";
import { isApiUrl } from "@/lib/api-origin";

const MAX_RECOVERY_ATTEMPTS = 3;
const RECOVERY_PROGRESS_SECONDS = 5;
const PLAYBACK_ERROR_MESSAGE = "動画を再生できません";

type props = {
  className?: string;
  movie?: FormattedMovie;
  videoRef: RefObject<HTMLVideoElement | null>;
};

const Video = ({ className, videoRef, movie }: props) => {
  const setMetadata = useSetAtom(VideoMetadataAtom);
  const setState = useSetAtom(PlayerStateAtom);
  const playerConfig = useAtomValue(PlayerConfigAtom);
  const playbackRate = useAtomValue(PlayerPlaybackRateAtom);
  const [configVolume, setConfigVolume] = useAtom(PlayerVolumeAtom);
  const [configMuted, setConfigMuted] = useAtom(PlayerMutedAtom);
  const setWatchedHistory = useSetAtom(watchedHistoryAtom);
  const setHls = useSetAtom(HlsRefAtom);
  const setAudioTracks = useSetAtom(AudioTracksAtom);
  const setAudioTrackId = useSetAtom(AudioTrackIdAtom);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  // The URL the current source was loaded from. A ref, not state: it must not
  // retrigger the loading effect that sets it.
  const loadedUrlRef = useRef("");

  const hlsRef = useRef<Hls | null>(null);
  const lastHistorySaveRef = useRef({ at: 0, movieId: "", watched: -1 });
  const selectedAudioTrackRef = useRef(-1);
  // Last known playback position. Read when the source is swapped: by the time
  // the effect body runs, its cleanup has already detached the old source and
  // reset the element's currentTime to 0.
  const lastPlaybackTimeRef = useRef(0);

  const navigate = useNavigate();

  const saveWatchedProgress = useCallback(
    (force = false) => {
      const video = videoRef.current;
      if (
        !movie ||
        !video ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        !Number.isFinite(video.currentTime)
      ) {
        return;
      }

      const now = Date.now();
      if (!force && now - lastHistorySaveRef.current.at < 5000) return;
      const watched = Math.max(
        0,
        Math.min(1, video.currentTime / video.duration),
      );
      const lastSaved = lastHistorySaveRef.current;
      if (lastSaved.movieId === movie.id && lastSaved.watched === watched)
        return;

      lastHistorySaveRef.current = { at: now, movieId: movie.id, watched };
      const entry = {
        movieId: movie.id,
        title: movie.title,
        thumbnailUrl: movie.thumbnailUrl ?? null,
        duration: video.duration,
        watched,
        updatedAt: now,
      };

      setWatchedHistory((previous) => {
        const next = { ...previous, [movie.id]: entry };
        const recentEntries = Object.values(next)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_WATCHED_HISTORY_ENTRIES);
        return Object.fromEntries(
          recentEntries.map((historyEntry) => [
            historyEntry.movieId,
            historyEntry,
          ]),
        );
      });
    },
    [movie, setWatchedHistory, videoRef],
  );

  useEffect(() => {
    const saveOnPageHide = () => saveWatchedProgress(true);
    window.addEventListener("pagehide", saveOnPageHide);
    return () => window.removeEventListener("pagehide", saveOnPageHide);
  }, [saveWatchedProgress]);

  const onVideoPlay = () => {
    setState((pv) => ({ ...pv, paused: false }));
  };

  const onVideoPause = () => {
    setState((pv) => ({ ...pv, paused: true }));
    saveWatchedProgress(true);
  };

  const onVideoVolumeChange = () => {
    const video = videoRef.current;
    if (!video) return;
    // Muting changes `muted` only, so the stored volume survives it.
    setConfigVolume(video.volume);
    setConfigMuted(video.muted);
  };

  const onVideoLoadedMetadata = () => {
    setMetadata((pv) => ({
      ...pv,
      duration: videoRef.current?.duration || 0,
    }));
    setState((pv) => ({ ...pv, paused: true, isLoading: true }));
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
    saveWatchedProgress(true);
    void videoRef.current?.play().catch(console.warn);
  };

  const onVideoRateChange = () => {
    if (videoRef.current && videoRef.current.playbackRate !== playbackRate) {
      videoRef.current.playbackRate = playbackRate;
    }
  };

  const onVideoTimeUpdate = () => {
    lastPlaybackTimeRef.current = videoRef.current?.currentTime || 0;
    setMetadata((pv) => ({
      ...pv,
      currentTime: videoRef.current?.currentTime || 0,
    }));
    saveWatchedProgress();
  };

  const onVideoEnded = () => {
    saveWatchedProgress(true);
    if (!playerConfig.autoPlayNext || !movie) return;
    const next = findNext(movie);
    if (!next) return;
    void navigate({ to: "/movies/$movie", params: { movie: next.id } });
  };

  const onVideoCanPlay = () => {
    setState((pv) => ({ ...pv, isLoading: false }));
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  };

  // hls.js reports its own errors; this covers native HLS playback.
  const onVideoError = () => {
    if (hlsRef.current) return;
    setState((pv) => ({
      ...pv,
      isLoading: false,
      error: PLAYBACK_ERROR_MESSAGE,
    }));
  };

  const onVideoSeeked = () => setState((pv) => ({ ...pv, isLoading: false }));
  const onVideoSeeking = () => setState((pv) => ({ ...pv, isLoading: true }));

  // The effects below depend on the element itself (not on `videoRef.current`,
  // which is not reactive), so it is tracked in state through a callback ref
  // that also keeps the shared ref current.
  const setVideoNode = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      setVideoEl(node);
    },
    [videoRef],
  );

  // Starts playback of `sourceUrl` on `video` and returns what undoes it.
  const loadVideo = useCallback(
    (
      video: HTMLVideoElement,
      sourceUrl: string,
      restoreAudioTrackId: number,
      resumeAt: number,
    ): (() => void) => {
      if (Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr, requestUrl) => {
            // Only the trusted API origin receives session credentials.
            xhr.withCredentials = isApiUrl(requestUrl);
          },
          enableWorker: true,
          startPosition: resumeAt > 0 ? resumeAt : -1,
        });
        let networkRetries = 0;
        let mediaRecoveries = 0;
        // Where playback was when the last media recovery started. Recoveries
        // only count as successful once playback advanced well past it.
        let recoveredAt = 0;
        const onTimeUpdate = () => {
          if (
            mediaRecoveries > 0 &&
            video.currentTime - recoveredAt >= RECOVERY_PROGRESS_SECONDS
          ) {
            mediaRecoveries = 0;
          }
        };
        video.addEventListener("timeupdate", onTimeUpdate);
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
          setAudioTracks(
            data.audioTracks.map((track) => ({
              id: track.id,
              name: track.name,
              lang: track.lang,
            })),
          );
          if (
            restoreAudioTrackId >= 0 &&
            data.audioTracks.some((track) => track.id === restoreAudioTrackId)
          ) {
            hls.audioTrack = restoreAudioTrackId;
          }
        });
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
          selectedAudioTrackRef.current = data.id;
          setAudioTrackId(data.id);
        });
        // A fetched fragment says nothing about whether it can be decoded, so
        // only the network retry budget is restored here.
        hls.on(Hls.Events.FRAG_LOADED, () => {
          networkRetries = 0;
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            networkRetries < MAX_RECOVERY_ATTEMPTS
          ) {
            networkRetries += 1;
            // startLoad() only resumes fragment loading; a failed manifest has
            // to be requested again from scratch.
            if (
              data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
              data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT
            ) {
              hls.loadSource(sourceUrl);
            } else {
              hls.startLoad();
            }
            return;
          }
          if (
            data.type === Hls.ErrorTypes.MEDIA_ERROR &&
            mediaRecoveries < MAX_RECOVERY_ATTEMPTS
          ) {
            mediaRecoveries += 1;
            recoveredAt = video.currentTime;
            hls.recoverMediaError();
            return;
          }
          console.error("Unrecoverable HLS error", data);
          if (hlsRef.current === hls) {
            hlsRef.current = null;
            setHls(null);
          }
          video.removeEventListener("timeupdate", onTimeUpdate);
          hls.destroy();
          setState((pv) => ({
            ...pv,
            isLoading: false,
            error: PLAYBACK_ERROR_MESSAGE,
          }));
        });
        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
        hlsRef.current = hls;
        setHls(hls);
        video.crossOrigin = "anonymous";
        video.disableRemotePlayback = true;
        return () => {
          video.removeEventListener("timeupdate", onTimeUpdate);
          if (hlsRef.current === hls) {
            hlsRef.current = null;
            setHls(null);
          }
          hls.destroy();
        };
      }

      // No MSE (older iPhone Safari): Safari plays HLS natively.
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.removeAttribute("crossorigin");
        video.src = sourceUrl;
        // Kept so cleanup can remove it: a stale resume callback must not seek
        // whatever source is loaded next.
        const resume = () => {
          video.currentTime = resumeAt;
        };
        if (resumeAt > 0) {
          video.addEventListener("loadedmetadata", resume, { once: true });
        }
        return () => {
          video.removeEventListener("loadedmetadata", resume);
          video.removeAttribute("src");
          video.load();
        };
      }

      setState((pv) => ({
        ...pv,
        isLoading: false,
        error: PLAYBACK_ERROR_MESSAGE,
      }));
      return () => undefined;
    },
    [setHls, setAudioTracks, setAudioTrackId, setState],
  );

  useEffect(() => {
    if (!videoEl) return;
    videoEl.playbackRate = playbackRate;
  }, [playbackRate, videoEl]);

  useEffect(() => {
    if (!videoEl) return;
    videoEl.volume = configVolume;
  }, [configVolume, videoEl]);

  useEffect(() => {
    if (!videoEl) return;
    videoEl.muted = configMuted;
  }, [configMuted, videoEl]);

  const contentUrl = movie?.variants[0]?.contentUrl;

  // Depends only on the element and the source URL string, so a new `movie`
  // object (SWR revalidation, ...) cannot recreate the player.
  useEffect(() => {
    if (!videoEl) return;
    // Errors belong to the source that produced them; clear them for every new
    // source, including an empty one (e.g. a movie still uploading).
    setState((pv) => (pv.error ? { ...pv, error: null } : pv));
    if (!contentUrl) {
      loadedUrlRef.current = "";
      selectedAudioTrackRef.current = -1;
      setAudioTracks([]);
      setAudioTrackId(-1);
      setHls(null);
      return;
    }

    // Same media under a rotated token: continue from where playback is.
    const previousUrl = loadedUrlRef.current;
    const sameSource =
      previousUrl !== "" && sameVodSource(contentUrl, previousUrl);
    const resumeAt = sameSource ? lastPlaybackTimeRef.current : 0;
    if (!sameSource) {
      selectedAudioTrackRef.current = -1;
      lastPlaybackTimeRef.current = 0;
    }
    loadedUrlRef.current = contentUrl;

    const unload = loadVideo(
      videoEl,
      contentUrl,
      sameSource ? selectedAudioTrackRef.current : -1,
      resumeAt,
    );
    return () => {
      unload();
      setAudioTracks([]);
      setAudioTrackId(-1);
    };
  }, [
    videoEl,
    contentUrl,
    loadVideo,
    setHls,
    setAudioTracks,
    setAudioTrackId,
    setState,
  ]);

  return (
    <video
      ref={setVideoNode}
      className={className}
      onPlay={onVideoPlay}
      onRateChange={onVideoRateChange}
      onPause={onVideoPause}
      onVolumeChange={onVideoVolumeChange}
      onLoadedMetadata={onVideoLoadedMetadata}
      onTimeUpdate={onVideoTimeUpdate}
      onCanPlay={onVideoCanPlay}
      onSeeking={onVideoSeeking}
      onSeeked={onVideoSeeked}
      onEnded={onVideoEnded}
      onError={onVideoError}
    />
  );
};

// Playback URLs embed a short-lived token (/vod/<token>/<key>/...) that
// rotates hourly; the same movie must not look like a new source when only
// the token changed, or the position would reset.
const stripVodToken = (contentUrl: string): string =>
  contentUrl.replace(/(\/vod\/)[^/]+\//, "$1");
const sameVodSource = (a: string, b: string): boolean =>
  stripVodToken(a) === stripVodToken(b);

export { Video };

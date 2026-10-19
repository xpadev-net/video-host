import type { FormattedMovie } from "@video-host/backend";
import type Hls from "hls.js";
import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import type {
  PlayerAudioTrack,
  PlayerConfig,
  PlayerState,
  SettingKey,
  VideoMetadata,
} from "@/@types/Player";

const DurablePlayerAtom = atom<{
  target: HTMLElement | null;
  className?: string;
} | null>(null);
const CurrentMovieAtom = atom<FormattedMovie | null>(null);

const WrapperRefAtom = atom<HTMLElement | null>(null);
const VideoRefAtom = atom<HTMLVideoElement | null>(null);
const HlsRefAtom = atom<Hls | null>(null);
const AudioTracksAtom = atom<PlayerAudioTrack[]>([]);
const AudioTrackIdAtom = atom<number>(-1);
const VideoMetadataAtom = atom<VideoMetadata>({ currentTime: 0, duration: 0 });

const PlayerStateAtom = atom<PlayerState>({
  paused: false,
  isLoading: true,
  isSetting: false,
  isFullscreen: false,
  error: null,
});
// "autoPlay" was renamed to "autoPlayNext" (it only ever meant "play the next
// movie"). Keep the value people already chose when reading older storage.
const baseConfigStorage = createJSONStorage<PlayerConfig>();
const playerConfigStorage = {
  ...baseConfigStorage,
  getItem: (key: string, initialValue: PlayerConfig): PlayerConfig => {
    const stored = baseConfigStorage.getItem(
      key,
      initialValue,
    ) as PlayerConfig & Partial<{ autoPlay: boolean }>;
    if (!stored || typeof stored !== "object" || !("autoPlay" in stored)) {
      return stored;
    }
    const { autoPlay, ...rest } = stored;
    return { ...rest, autoPlayNext: rest.autoPlayNext ?? autoPlay ?? true };
  },
};

const PlayerConfigAtom = atomWithStorage<PlayerConfig>(
  "playerConfig",
  {
    windowFullscreen: true,
    autoPlayNext: true,
    isTheatre: false,
  },
  playerConfigStorage,
);

const PlayerPlaybackRateAtom = atomWithStorage<number>(
  "playerConfig.playerPlaybackRate",
  1,
);

const PlayerVolumeAtom = atomWithStorage<number>(
  "playerConfig.playerVolume",
  1,
);

// Mute is its own flag: muting must not touch the stored volume, or the
// pre-mute volume is lost.
const PlayerMutedAtom = atomWithStorage<boolean>(
  "playerConfig.playerMuted",
  false,
);

const PlayerSettingAtom = atom<SettingKey[]>(["main"]);

const PlayerSeekNotificationAtom = atom<{
  direction: "forward" | "backward";
  seconds: number;
} | null>(null);

const PlayerPlayPauseNotificationAtom = atom<{
  action: "play" | "pause";
} | null>(null);

export {
  AudioTrackIdAtom,
  AudioTracksAtom,
  CurrentMovieAtom,
  DurablePlayerAtom,
  HlsRefAtom,
  PlayerConfigAtom,
  PlayerMutedAtom,
  PlayerPlaybackRateAtom,
  PlayerPlayPauseNotificationAtom,
  PlayerSeekNotificationAtom,
  PlayerSettingAtom,
  PlayerStateAtom,
  PlayerVolumeAtom,
  VideoMetadataAtom,
  VideoRefAtom,
  WrapperRefAtom,
};

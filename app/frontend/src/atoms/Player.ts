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
// movie"). During the transition both names are kept in storage:
// - reads/subscriptions migrate whatever shape arrives, so a choice saved under
//   the old name is not lost;
// - writes also store the old name, so a tab still on the previous release
//   keeps seeing the setting.
// This writer always stores the two equal, so when they differ an old tab wrote
// the old one last and it wins.
const baseConfigStorage = createJSONStorage<PlayerConfig>();

const migrateConfig = (stored: PlayerConfig): PlayerConfig => {
  const legacy = stored as PlayerConfig & Partial<{ autoPlay: boolean }>;
  if (!legacy || typeof legacy !== "object" || !("autoPlay" in legacy)) {
    return stored;
  }
  const { autoPlay, ...rest } = legacy;
  return {
    ...rest,
    autoPlayNext:
      typeof autoPlay === "boolean" ? autoPlay : (rest.autoPlayNext ?? true),
  };
};

const playerConfigStorage = {
  ...baseConfigStorage,
  getItem: (key: string, initialValue: PlayerConfig): PlayerConfig =>
    migrateConfig(baseConfigStorage.getItem(key, initialValue)),
  setItem: (key: string, value: PlayerConfig) =>
    baseConfigStorage.setItem(key, {
      ...value,
      autoPlay: value.autoPlayNext,
    } as PlayerConfig),
  // Updates written by another tab arrive here, not through getItem, so they
  // need the same migration.
  subscribe: baseConfigStorage.subscribe
    ? (
        key: string,
        callback: (value: PlayerConfig) => void,
        initialValue: PlayerConfig,
      ) =>
        baseConfigStorage.subscribe?.(
          key,
          (value) => callback(migrateConfig(value)),
          initialValue,
        ) ?? (() => undefined)
    : undefined,
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

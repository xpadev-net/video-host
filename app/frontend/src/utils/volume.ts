// Mute is the element's own `muted` flag; `volume` is left alone so unmuting
// brings back the level the viewer had chosen.

/** Click on the speaker icon: mute, or unmute (restoring audibility). */
export const toggleMute = (video: HTMLMediaElement): void => {
  if (video.muted || video.volume === 0) {
    video.muted = false;
    // Unmuting a video whose volume was dragged to 0 would stay silent.
    if (video.volume === 0) video.volume = 1;
  } else {
    video.muted = true;
  }
};

/** Whether nothing can currently be heard. */
export const isSilent = (volume: number, muted: boolean): boolean =>
  muted || volume === 0;

/** Level to display: 0 while muted. */
export const effectiveVolume = (volume: number, muted: boolean): number =>
  muted ? 0 : volume;

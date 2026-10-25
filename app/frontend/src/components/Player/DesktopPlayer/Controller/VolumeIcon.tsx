import { useAtomValue } from "jotai";
import { Volume1, Volume2, VolumeX } from "lucide-react";

import { PlayerMutedAtom, PlayerVolumeAtom } from "@/atoms/Player";
import { isSilent } from "@/utils/volume";

const VolumeIcon = () => {
  const volume = useAtomValue(PlayerVolumeAtom);
  const muted = useAtomValue(PlayerMutedAtom);
  if (isSilent(volume, muted)) {
    return <VolumeX aria-hidden="true" />;
  }
  if (volume > 0.5) {
    return <Volume2 aria-hidden="true" />;
  }
  return <Volume1 aria-hidden="true" />;
};

export { VolumeIcon };

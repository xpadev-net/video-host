import { useAtomValue } from "jotai";
import { Volume1, Volume2, VolumeX } from "lucide-react";

import { PlayerVolumeAtom } from "@/atoms/Player";

const VolumeIcon = () => {
  const volume = useAtomValue(PlayerVolumeAtom);
  if (volume > 0.5) {
    return <Volume2 aria-hidden="true" />;
  }
  if (volume > 0.1) {
    return <Volume1 aria-hidden="true" />;
  }
  if (volume > 0) {
    return <Volume1 aria-hidden="true" />;
  }
  return <VolumeX aria-hidden="true" />;
};

export { VolumeIcon };

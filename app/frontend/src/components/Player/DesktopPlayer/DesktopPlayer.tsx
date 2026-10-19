import type { FormattedMovie } from "@video-host/backend";

import { PlayerSurface } from "@/components/Player/Shared/PlayerSurface";

type Props = {
  className?: string;
  data: FormattedMovie;
  id: string;
  isPipMode?: boolean;
};

export function DesktopPlayer(props: Props) {
  return <PlayerSurface {...props} variant="desktop" />;
}

import type { FormattedMovie } from "@video-host/backend";

import { PlayerSurface } from "@/components/Player/Shared/PlayerSurface";

type Props = {
  className?: string;
  data: FormattedMovie;
  id: string;
  isPipMode?: boolean;
};

export function MobilePlayer(props: Props) {
  return <PlayerSurface {...props} variant="mobile" />;
}

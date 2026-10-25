import type { ComponentProps } from "react";

import { Slider as SharedSlider } from "@/components/Player/Shared/Controller/Slider";

type Props = ComponentProps<typeof SharedSlider>;

export function Slider(props: Props) {
  return <SharedSlider {...props} centered />;
}

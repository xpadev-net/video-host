import type { ReactNode } from "react";
import { FeedbackProvider } from "@/components/Feedback/FeedbackProvider";
import { Theme } from "@/components/Theme";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Theme>
      <FeedbackProvider>{children}</FeedbackProvider>
    </Theme>
  );
}

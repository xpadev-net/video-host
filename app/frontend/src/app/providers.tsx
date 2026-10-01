"use client";

import type { ReactNode } from "react";
import { Theme } from "@/components/Theme";

export function Providers({ children }: { children: ReactNode }) {
  return <Theme>{children}</Theme>;
}

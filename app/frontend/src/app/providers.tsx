"use client";

import { useAtomValue } from "jotai";
import type { ReactNode } from "react";

import { AuthTokenAtom } from "@/atoms/Auth";
import { Theme } from "@/components/Theme";

export function Providers({ children }: { children: ReactNode }) {
  const _token = useAtomValue(AuthTokenAtom);

  return <Theme>{children}</Theme>;
}

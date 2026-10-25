import type { ReactNode } from "react";
import { useTheme } from "@/hooks/useTheme";

export const Theme = ({ children }: { children: ReactNode }) => {
  useTheme();
  return children;
};

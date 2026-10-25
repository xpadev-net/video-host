import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
  width?: string;
  height?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export function Skeleton({
  className,
  width,
  height,
  style,
  children,
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded bg-[var(--skeleton)]", className)}
      style={{ width, height, ...style }}
    >
      {children}
    </div>
  );
}

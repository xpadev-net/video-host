import type { FC } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  size?: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
};

export const UserSkeleton: FC<Props> = ({ size = "3" }) => {
  const avatarSize = {
    "1": "24px",
    "2": "32px",
    "3": "40px",
    "4": "48px",
    "5": "64px",
    "6": "80px",
    "7": "96px",
    "8": "128px",
  }[size];

  return (
    <div className="flex w-full flex-row items-center gap-2">
      <Skeleton
        width={avatarSize}
        height={avatarSize}
        style={{ borderRadius: "9999px" }}
      />
      <Skeleton height="20px" className="text-text text-nowrap w-3/4" />
    </div>
  );
};

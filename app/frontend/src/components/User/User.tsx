import { Link } from "@tanstack/react-router";
import type { FilteredUser } from "@video-host/backend";
import { type FC, useState } from "react";

type Props = {
  user: FilteredUser;
  size?: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
};

export const User: FC<Props> = ({ user, size }) => {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const showAvatar = Boolean(
    user.avatarUrl && failedAvatarUrl !== user.avatarUrl,
  );

  return (
    <Link
      to="/users/$user"
      params={{ user: user.id }}
      className={"decoration-none hover:underline"}
    >
      <span className="flex flex-row items-center gap-2">
        <span
          className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-thirdly-background text-sm"
          style={{ width: avatarSize(size), height: avatarSize(size) }}
        >
          {!showAvatar && <span>{user.name.slice(0, 2)}</span>}
          {showAvatar && user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setFailedAvatarUrl(user.avatarUrl ?? null)}
            />
          )}
        </span>
        <span className={"text-text text-nowrap"}>{user.name}</span>
      </span>
    </Link>
  );
};

const avatarSize = (size: Props["size"]) => {
  const sizes = {
    "1": "24px",
    "2": "32px",
    "3": "40px",
    "4": "48px",
    "5": "64px",
    "6": "80px",
    "7": "96px",
    "8": "128px",
  };
  return sizes[size ?? "3"];
};

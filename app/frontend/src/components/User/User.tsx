import { Avatar, Flex } from "@radix-ui/themes";
import { Link } from "@tanstack/react-router";
import type { FilteredUser } from "@video-host/backend";
import type { FC } from "react";

type Props = {
  user: FilteredUser;
  size?: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
};

export const User: FC<Props> = ({ user, size }) => {
  return (
    <Link
      to="/users/$user"
      params={{ user: user.id }}
      className={"decoration-none hover:underline"}
    >
      <Flex direction={"row"} align={"center"} gap={"2"}>
        <Avatar
          fallback={user.name.slice(0, 2)}
          size={size}
          src={user.avatarUrl || undefined}
        />
        <span className={"text-text text-nowrap"}>{user.name}</span>
      </Flex>
    </Link>
  );
};

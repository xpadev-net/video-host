import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { MoviesSearchList } from "@/components/SearchList/MoviesSearchList";
import { SeriesSearchList } from "@/components/SearchList/SeriesSearchList";
import { type TabItem, TabSwitcher } from "@/components/TabSwitcher";
import { User } from "@/components/User/User";
import { UserSkeleton } from "@/components/User/UserSkeleton";
import { SiteName } from "@/contexts/env";
import { useUser } from "@/hooks/useUser";

export const Route = createFileRoute("/_app/users/$user")({
  head: () => ({ meta: [{ title: SiteName }] }),
  component: UserRoute,
});

function UserRoute() {
  const { user: userId } = Route.useParams();
  const { data: user, error, isLoading, mutate } = useUser(userId);

  useEffect(() => {
    if (user?.status === "ok" && "data" in user && user.data) {
      const previousTitle = document.title;
      const title = `${user.data.name} - ${SiteName}`;
      document.title = title;
      return () => {
        if (document.title === title) document.title = previousTitle;
      };
    }
  }, [user]);

  if (isLoading && !user) {
    return (
      <div className="p-6 pt-3 max-w-[1070px] mx-auto" aria-busy="true">
        <UserSkeleton size="4" />
      </div>
    );
  }

  if (error && !user) {
    return (
      <LoadErrorMessage
        message="ユーザーを読み込めませんでした"
        onRetry={() => void mutate()}
      />
    );
  }

  if (!user) {
    return (
      <LoadErrorMessage
        message="ユーザーを読み込めませんでした"
        onRetry={() => void mutate()}
      />
    );
  }

  if (user.status === "error" && user.code === 404) {
    return <LoadErrorMessage message="ユーザーが見つかりませんでした" />;
  }

  if (user.status !== "ok" || !("data" in user) || !user.data) {
    return (
      <LoadErrorMessage
        message="ユーザーを読み込めませんでした"
        onRetry={() => void mutate()}
      />
    );
  }

  const tabs: TabItem[] = [
    {
      value: "series",
      label: "シリーズ",
      content: <SeriesSearchList author={user.data.id} />,
    },
    {
      value: "movies",
      label: "動画",
      content: <MoviesSearchList author={user.data.id} />,
    },
  ];

  return (
    <div className="p-6 pt-3 max-w-[1070px] mx-auto">
      {error ? (
        <LoadErrorMessage
          message="ユーザー情報を更新できませんでした"
          onRetry={() => void mutate()}
        />
      ) : null}
      <User user={user.data} size="4" />
      <TabSwitcher tabs={tabs} defaultValue="series" />
    </div>
  );
}

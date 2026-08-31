import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { MoviesSearchList } from "@/components/SearchList/MoviesSearchList";
import { SeriesSearchList } from "@/components/SearchList/SeriesSearchList";
import { type TabItem, TabSwitcher } from "@/components/TabSwitcher";
import { User } from "@/components/User/User";
import { SiteName } from "@/contexts/env";
import { useUser } from "@/hooks/useUser";

export const Route = createFileRoute("/_app/users/$user")({
  head: () => ({ meta: [{ title: SiteName }] }),
  component: UserRoute,
});

function UserRoute() {
  const { user: userId } = Route.useParams();
  const { data: user, isLoading } = useUser(userId);

  useEffect(() => {
    if (user?.status === "ok" && "data" in user && user.data) {
      document.title = `${user.data.name} - ${SiteName}`;
    }
  }, [user]);

  if (isLoading || !user) return null;

  if (user.status !== "ok" || !("data" in user) || !user.data) {
    return (
      <div className="p-6 pt-3 max-w-[1070px] mx-auto">
        <h1>読み込みに失敗しました</h1>
        <div className="error">
          {user.code} - {"message" in user ? user.message : "Unknown error"}
        </div>
      </div>
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
      <User user={user.data} size="4" />
      <TabSwitcher tabs={tabs} defaultValue="series" />
    </div>
  );
}

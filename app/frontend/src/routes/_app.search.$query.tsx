import { createFileRoute } from "@tanstack/react-router";

import { MoviesSearchList } from "@/components/SearchList/MoviesSearchList";
import { SeriesSearchList } from "@/components/SearchList/SeriesSearchList";
import { type TabItem, TabSwitcher } from "@/components/TabSwitcher";
import { SiteName } from "@/contexts/env";

export const Route = createFileRoute("/_app/search/$query")({
  head: ({ params }) => ({
    meta: [{ title: `検索: ${params.query} - ${SiteName}` }],
  }),
  component: SearchRoute,
});

function SearchRoute() {
  const { query } = Route.useParams();
  const tabs: TabItem[] = [
    {
      value: "series",
      label: "シリーズ",
      content: <SeriesSearchList query={query} />,
    },
    {
      value: "movies",
      label: "動画",
      content: <MoviesSearchList query={query} />,
    },
  ];

  return (
    <div className="p-6 pt-3 max-w-[1070px] mx-auto">
      <TabSwitcher tabs={tabs} defaultValue="series" />
    </div>
  );
}

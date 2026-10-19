import { createFileRoute, Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { type SetStateAction, useCallback, useState } from "react";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { PaginationControls } from "@/components/Dashboard/PaginationControls";
import { useConfirm, useNotify } from "@/components/Feedback/FeedbackProvider";
import { useMySeries } from "@/hooks/useDashboard";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";
import { visibility2str } from "@/utils/visibility2str";

export const Route = createFileRoute("/_app/dashboard/series/")({
  head: () => ({ meta: [{ title: "シリーズ管理" }] }),
  component: SeriesPage,
});

function SeriesPage() {
  const { data: user, isLoading: isUserLoading } = useSelf();
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  const [pagination, setPagination] = useState({
    accountId: selectedAccountId,
    profileId: selectedProfileId,
    page: 1,
  });
  const page =
    pagination.accountId === selectedAccountId &&
    pagination.profileId === selectedProfileId
      ? pagination.page
      : 1;
  const setPage = useCallback(
    (nextPage: SetStateAction<number>) => {
      setPagination((current) => {
        const currentPage =
          current.accountId === selectedAccountId &&
          current.profileId === selectedProfileId
            ? current.page
            : 1;
        return {
          accountId: selectedAccountId,
          profileId: selectedProfileId,
          page:
            typeof nextPage === "function" ? nextPage(currentPage) : nextPage,
        };
      });
    },
    [selectedAccountId, selectedProfileId],
  );
  const { data: seriesData, error, mutate } = useMySeries(page);
  const confirm = useConfirm();
  const notify = useNotify();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const handleDelete = async (id: string) => {
    const profileId = selectedProfileId;
    if (
      !(await confirm({
        title: "シリーズを削除しますか？",
        description: "シリーズ内の動画は削除されません。",
        confirmLabel: "削除",
        destructive: true,
      }))
    )
      return;

    setDeletingId(id);
    try {
      const res = await client.api.v4.series[":series"].$delete(
        { param: { series: id } },
        { headers: { "X-Profile-Id": profileId ?? "" } },
      );

      if (!res.ok) {
        throw new Error("Failed to delete");
      }

      if (seriesList.length === 1 && page > 1)
        setPage((current) => current - 1);
      else mutate();
    } catch (_err) {
      notify("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  if (isUserLoading) {
    return <DashboardLoading />;
  }

  if (!user) {
    return <div>ログインしてください</div>;
  }

  const seriesList = seriesData?.items || [];

  return (
    <>
      <div className="series-page">
        <div className="page-header">
          <h1>シリーズ管理</h1>
          <Link to="/dashboard/series/new" className="new-button">
            + 新規作成
          </Link>
        </div>

        {error ? (
          <div className="empty-state" role="alert">
            <p>シリーズを読み込めませんでした</p>
            <button
              className="action-btn"
              onClick={() => void mutate()}
              type="button"
            >
              再試行
            </button>
            {page > 1 && (
              <button
                className="action-btn"
                onClick={() => setPage(page - 1)}
                type="button"
              >
                前のページへ戻る
              </button>
            )}
          </div>
        ) : seriesList.length === 0 ? (
          <div className="empty-state">
            <p>シリーズがありません</p>
            <Link to="/dashboard/series/new">最初のシリーズを作成</Link>
          </div>
        ) : (
          <div className="series-list">
            {seriesList.map((series) => (
              <div key={series.id} className="series-item">
                <div className="series-info">
                  <h3>{series.title}</h3>
                  <div className="series-meta">
                    <span
                      className={`visibility-badge ${series.visibility.toLowerCase()}`}
                    >
                      {visibility2str(series.visibility)}
                    </span>
                    <span>{series.movies?.length || 0}本の動画</span>
                  </div>
                </div>
                <div className="series-actions">
                  <Link
                    to="/dashboard/series/$id/edit"
                    params={{ id: series.id }}
                    className="action-btn"
                  >
                    編集
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(series.id)}
                    disabled={deletingId === series.id}
                    className="action-btn delete"
                  >
                    {deletingId === series.id ? "削除中..." : "削除"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!error && seriesData?.pagination && (
          <PaginationControls
            onPageChange={setPage}
            page={page}
            totalCount={seriesData.pagination.totalCount}
            totalPages={seriesData.pagination.totalPages}
          />
        )}
      </div>
    </>
  );
}

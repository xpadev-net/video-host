import { DashboardPageSize } from "@/constants/pagination";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

export function PaginationControls({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="一覧のページ"
      className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
    >
      <p className="text-sm text-muted-foreground">
        {totalCount}件中{" "}
        {Math.min((page - 1) * DashboardPageSize + 1, totalCount)}–
        {Math.min(page * DashboardPageSize, totalCount)}件（{page} /{" "}
        {totalPages}ページ）
      </p>
      <div className="flex gap-2">
        <button
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          前へ
        </button>
        <button
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          次へ
        </button>
      </div>
    </nav>
  );
}

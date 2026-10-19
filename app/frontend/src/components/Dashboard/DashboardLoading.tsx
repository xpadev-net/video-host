import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoading() {
  return (
    <section
      aria-label="読み込み中"
      aria-live="polite"
      className="space-y-4 p-4"
      role="status"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </section>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

const PlayerSkeleton = () => {
  return (
    <div className="relative w-full aspect-video rounded-lg overflow-hidden">
      <Skeleton className="w-full !h-full block" />
    </div>
  );
};

export { PlayerSkeleton };

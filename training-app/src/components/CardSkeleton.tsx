type Props = {
  count?: number;
};

export function CardSkeleton({ count = 3 }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-theme-border bg-theme-bg-card-light p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {/* Title line */}
              <div className="h-5 w-3/4 rounded-md bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] animate-shimmer" />
              {/* Info lines */}
              <div className="mt-2 h-3 w-1/2 rounded-md bg-gradient-to-r from-gray-50 via-gray-150 to-gray-50 bg-[length:200%_100%] animate-shimmer" />
            </div>
            <div className="h-8 w-8 rounded-lg bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] animate-shimmer" />
          </div>
          {/* Bottom strip */}
          <div className="mt-3 h-8 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 bg-[length:200%_100%] animate-shimmer" />
        </div>
      ))}
    </div>
  );
}

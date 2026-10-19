type LoadErrorMessageProps = {
  message: string;
  onRetry?: () => void;
};

export const LoadErrorMessage = ({
  message,
  onRetry,
}: LoadErrorMessageProps) => (
  <div
    className="flex flex-col items-center gap-3 py-8 text-center text-[var(--color-text)]"
    role="alert"
  >
    <p>{message}</p>
    {onRetry && (
      <button
        className="rounded-md border border-[var(--color-sub-text)] px-4 py-2 hover:bg-[var(--color-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={onRetry}
        type="button"
      >
        再試行
      </button>
    )}
  </div>
);

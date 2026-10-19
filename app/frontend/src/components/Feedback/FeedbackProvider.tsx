import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
};

type Toast = {
  id: number;
  message: string;
  kind: "error" | "success";
};

type FeedbackContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (message: string, kind?: Toast["kind"]) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [confirmation, setConfirmation] = useState<ConfirmOptions | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingConfirm = useRef<((accepted: boolean) => void) | null>(null);
  const nextToastId = useRef(0);

  const confirm = useCallback((options: ConfirmOptions) => {
    pendingConfirm.current?.(false);
    setConfirmation(options);
    return new Promise<boolean>((resolve) => {
      pendingConfirm.current = resolve;
    });
  }, []);

  const settleConfirmation = useCallback((accepted: boolean) => {
    const resolve = pendingConfirm.current;
    pendingConfirm.current = null;
    setConfirmation(null);
    resolve?.(accepted);
  }, []);

  const notify = useCallback(
    (message: string, kind: Toast["kind"] = "error") => {
      const id = ++nextToastId.current;
      setToasts((current) => [...current, { id, message, kind }]);
    },
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmation && dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [confirmation]);

  return (
    <FeedbackContext.Provider value={{ confirm, notify }}>
      {children}
      {confirmation && (
        <dialog
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
          className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/60"
          onCancel={(event) => {
            event.preventDefault();
            settleConfirmation(false);
          }}
          ref={dialogRef}
        >
          <div className="space-y-3 p-6">
            <h2 className="text-lg font-semibold" id="confirm-dialog-title">
              {confirmation.title}
            </h2>
            <p
              className="text-sm text-muted-foreground"
              id="confirm-dialog-description"
            >
              {confirmation.description}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
                onClick={() => settleConfirmation(false)}
                type="button"
              >
                キャンセル
              </button>
              <button
                className={`rounded-md px-4 py-2 text-sm text-primary-foreground ${
                  confirmation.destructive
                    ? "bg-destructive hover:bg-destructive/90"
                    : "bg-primary hover:bg-primary/90"
                }`}
                onClick={() => settleConfirmation(true)}
                type="button"
              >
                {confirmation.confirmLabel ?? "続行"}
              </button>
            </div>
          </div>
        </dialog>
      )}
      <section
        aria-label="通知"
        aria-live="polite"
        className="fixed right-4 top-4 z-[40000] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastItem
            dismiss={() => dismissToast(toast.id)}
            key={toast.id}
            toast={toast}
          />
        ))}
      </section>
    </FeedbackContext.Provider>
  );
}

function ToastItem({ dismiss, toast }: { dismiss: () => void; toast: Toast }) {
  useEffect(() => {
    const timeout = window.setTimeout(dismiss, 5000);
    return () => window.clearTimeout(timeout);
  }, [dismiss]);

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm shadow-lg ${
        toast.kind === "error"
          ? "border-destructive/40 bg-card text-card-foreground"
          : "border-primary/40 bg-card text-card-foreground"
      }`}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      <span>{toast.message}</span>
      <button
        aria-label="通知を閉じる"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}

function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("FeedbackProvider is missing");
  return context;
}

export const useConfirm = () => useFeedback().confirm;
export const useNotify = () => useFeedback().notify;

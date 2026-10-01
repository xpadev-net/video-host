import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { LogIn, LogOut } from "lucide-react";
import { useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const AuthButton = () => {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const setSelectedAccount = useSetAtom(selectedAccountIdAtom);
  const { mutate } = useSWRConfig();
  const signingOut = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const signOut = async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    setLoading(true);
    setError("");
    try {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message);
      setSelectedAccount(null);
      await mutate(() => true, undefined, { revalidate: false });
      await navigate({ to: "/" });
    } catch {
      setError("ログアウトに失敗しました。もう一度お試しください");
    } finally {
      signingOut.current = false;
      setLoading(false);
    }
  };

  if (session) {
    return (
      <>
        <Button
          size="icon"
          variant="ghost"
          onClick={signOut}
          disabled={loading}
          aria-label="ログアウト"
          className="cursor-pointer"
        >
          <LogOut />
        </Button>
        {error && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </>
    );
  }
  return (
    <Button
      variant="ghost"
      onClick={() => {
        void navigate({
          to: "/login",
          search: { callback: pathname || "/" },
        });
      }}
      size="icon"
      disabled={isPending}
      aria-label="ログイン"
      className="cursor-pointer"
    >
      <LogIn />
    </Button>
  );
};

export { AuthButton };

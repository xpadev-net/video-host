import { useRouterState } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { AccountSwitcher } from "@/components/Dashboard/AccountSwitcher";
import { useProfiles } from "@/hooks/useProfiles";
import { authClient } from "@/lib/auth-client";

export function ProfileSelectionGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const { data: profiles, error, isLoading, mutate } = useProfiles();
  const [profileId, setProfileId] = useAtom(selectedProfileIdAtom);
  const [accountId] = useAtom(selectedAccountIdAtom);
  const accountRef = useRef(accountId);
  useLayoutEffect(() => {
    accountRef.current = accountId;
  }, [accountId]);
  const sessionId = session?.user.id;
  const profilesLoaded = profiles !== undefined;
  const hasLoadError = Boolean(error);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const valid = Boolean(
    profileId && profiles?.some((profile) => profile.id === profileId),
  );

  useEffect(() => {
    if (!sessionId || !profilesLoaded || !profileId || valid || hasLoadError)
      return;
    let cancelled = false;
    // A storage event may select a profile created in another tab. Cached
    // absence is not proof that the profile was deleted or belongs elsewhere.
    void mutate()
      .then((refreshed) => {
        if (
          cancelled ||
          accountRef.current !== accountId ||
          !refreshed ||
          refreshed.some((profile) => profile.id === profileId)
        )
          return;
        setProfileId((current) => (current === profileId ? null : current));
      })
      .catch(() => {
        /* Preserve the remembered selection when verification fails. */
      });
    return () => {
      cancelled = true;
    };
  }, [
    sessionId,
    accountId,
    profilesLoaded,
    profileId,
    valid,
    hasLoadError,
    mutate,
    setProfileId,
  ]);

  if (isPending)
    return (
      <p role="status" className="p-6">
        読み込み中...
      </p>
    );
  if (!session) return children;
  // Account administration does not require assuming a profile identity.
  if (pathname === "/dashboard/admin/accounts") return children;
  if (isLoading || (!profiles && !error))
    return (
      <p role="status" className="p-6">
        プロフィールを読み込み中...
      </p>
    );
  if (error)
    return (
      <section className="mx-auto max-w-lg p-6">
        <p role="alert">プロフィールを読み込めませんでした。</p>
        <button type="button" onClick={() => void mutate()}>
          再試行
        </button>
        <AccountSwitcher />
      </section>
    );
  if (valid) return children;
  return (
    <section
      className="mx-auto w-full max-w-lg p-6"
      aria-labelledby="profile-selection-title"
    >
      <h1 id="profile-selection-title" className="text-2xl font-bold mb-4">
        {profiles?.length ? "利用するプロフィールを選択" : "プロフィールを作成"}
      </h1>
      <p className="mb-4">
        {profiles?.length
          ? "この端末で利用するプロフィールを選択してください。"
          : "プロフィールを作成して利用を開始してください。"}
      </p>
      <AccountSwitcher />
    </section>
  );
}

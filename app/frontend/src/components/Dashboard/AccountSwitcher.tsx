import { Link } from "@tanstack/react-router";
import type { InferResponseType } from "hono";
import { useAtom, useAtomValue } from "jotai";
import { type FC, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
  uploadSelectionLockedAtom,
} from "@/atoms/SelectedAccount";
import { ProfileVisibilityEditor } from "@/components/Dashboard/ProfileVisibilityEditor";
import { useAccount } from "@/hooks/useAccount";
import { useAccounts } from "@/hooks/useDashboard";
import { useProfiles } from "@/hooks/useProfiles";
import { useSelf } from "@/hooks/useUser";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

type Account = InferResponseType<
  (typeof client.api.v4)["accounts"]["$get"]
>["data"][number];

export const AccountSwitcher: FC = () => {
  const { data: user, mutate: mutateSelf } = useSelf();
  const { data: authSession } = authClient.useSession();
  const sessionUserId = authSession?.user.id;
  const { data: account } = useAccount();
  const isAdmin = account?.role === "ADMIN";
  const { data: accounts } = useAccounts(Boolean(isAdmin));
  const {
    data: profiles,
    error: profilesLoadError,
    mutate: mutateProfiles,
  } = useProfiles();
  const [selectedAccountId, setSelectedAccountId] = useAtom(
    selectedAccountIdAtom,
  );
  const [selectedProfileId, setSelectedProfileId] = useAtom(
    selectedProfileIdAtom,
  );
  const selectionLocked = useAtomValue(uploadSelectionLockedAtom);
  const uploadBusyRef = useRef(selectionLocked);
  const creationRequestRef = useRef(0);
  const selectedAccountIdRef = useRef(selectedAccountId);
  const selectedProfileIdRef = useRef(selectedProfileId);
  const selectionGenerationRef = useRef(0);
  const sessionUserIdRef = useRef(sessionUserId);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  const profileList = profiles ?? [];

  useLayoutEffect(
    () => () => {
      creationRequestRef.current += 1;
    },
    [],
  );

  useLayoutEffect(() => {
    if (sessionUserIdRef.current !== sessionUserId) {
      sessionUserIdRef.current = sessionUserId;
      creationRequestRef.current += 1;
      selectionGenerationRef.current += 1;
      setProfileError(null);
      setIsCreatingProfile(false);
    }
    if (selectedProfileIdRef.current !== selectedProfileId) {
      selectedProfileIdRef.current = selectedProfileId;
      selectionGenerationRef.current += 1;
    }
    if (selectedAccountIdRef.current !== selectedAccountId) {
      creationRequestRef.current += 1;
      selectionGenerationRef.current += 1;
      setProfileError(null);
      setIsCreatingProfile(false);
    }
    selectedAccountIdRef.current = selectedAccountId;
    uploadBusyRef.current = selectionLocked;
  }, [selectedAccountId, selectedProfileId, sessionUserId, selectionLocked]);

  useEffect(() => {
    if (account && !isAdmin) {
      setSelectedAccountId(null);
      return;
    }
    if (selectedAccountId && accounts) {
      const accountExists = (accounts ?? []).some(
        (account) => account.id === selectedAccountId,
      );
      if (!accountExists) setSelectedAccountId(null);
    }
  }, [selectedAccountId, accounts, setSelectedAccountId, isAdmin, account]);

  const accountList: Account[] = accounts ?? [];
  const selectedAccount = selectedAccountId
    ? accountList.find((account) => account.id === selectedAccountId)
    : null;
  const selectedProfile = profileList.find(
    (profile) => profile.id === selectedProfileId,
  );
  const profileSelectValue = selectedProfile?.id ?? "";

  const handleProfileChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (selectionLocked) return;
    const value = event.target.value;
    const nextProfileId = value || null;
    setSelectedProfileId(nextProfileId);
  };

  const handleCreateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selectionLocked || isCreatingProfile) return;
    const creationRequest = ++creationRequestRef.current;
    const accountIdAtStart = selectedAccountIdRef.current;
    const selectionGenerationAtStart = selectionGenerationRef.current;
    const sessionUserIdAtStart = sessionUserIdRef.current;
    setProfileError(null);
    setIsCreatingProfile(true);
    try {
      const res = await client.api.v4.users.profiles.$post({
        json: {
          name: newName,
          username: newUsername,
          accountId: selectedAccountIdRef.current ?? undefined,
        },
      });
      if (!res.ok) {
        if (
          sessionUserIdRef.current === sessionUserIdAtStart &&
          selectedAccountIdRef.current === accountIdAtStart &&
          selectionGenerationRef.current === selectionGenerationAtStart
        ) {
          setProfileError(
            "作成できませんでした。ユーザー名の重複がないか確認してください。",
          );
        }
        return;
      }
      const profile = (await res.json()).data;
      if (
        sessionUserIdRef.current !== sessionUserIdAtStart ||
        selectedAccountIdRef.current !== accountIdAtStart ||
        creationRequestRef.current !== creationRequest
      )
        return;
      await mutateProfiles((current) => [...(current ?? []), profile], {
        revalidate: false,
      });
      if (
        sessionUserIdRef.current !== sessionUserIdAtStart ||
        selectedAccountIdRef.current !== accountIdAtStart ||
        creationRequestRef.current !== creationRequest
      )
        return;
      setNewName("");
      setNewUsername("");
      if (
        selectedAccountIdRef.current === accountIdAtStart &&
        selectionGenerationRef.current === selectionGenerationAtStart &&
        !uploadBusyRef.current
      )
        setSelectedProfileId(profile.id);
    } catch {
      if (
        sessionUserIdRef.current === sessionUserIdAtStart &&
        selectedAccountIdRef.current === accountIdAtStart &&
        selectionGenerationRef.current === selectionGenerationAtStart
      )
        setProfileError("プロフィールを作成できませんでした。");
    } finally {
      if (
        sessionUserIdRef.current === sessionUserIdAtStart &&
        selectedAccountIdRef.current === accountIdAtStart &&
        creationRequestRef.current === creationRequest
      )
        setIsCreatingProfile(false);
    }
  };

  return (
    <div className="account-switcher">
      {selectionLocked && (
        <p role="status">
          アップロード処理が完了するまでプロフィールの切替はできません。
        </p>
      )}
      {profilesLoadError && (
        <p role="alert">
          プロフィールを更新できませんでした。{" "}
          <button type="button" onClick={() => void mutateProfiles()}>
            再試行
          </button>
        </p>
      )}
      {profileList.length > 0 && (
        <>
          <label htmlFor="profile-select" className="account-switcher-label">
            プロフィール
          </label>
          <select
            id="profile-select"
            value={profileSelectValue}
            onChange={handleProfileChange}
            disabled={selectionLocked}
            className="account-switcher-select"
          >
            <option value="" disabled>
              プロフィールを選択してください
            </option>
            {profileList.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} @{profile.username}
              </option>
            ))}
          </select>
        </>
      )}
      {user && (
        <ProfileVisibilityEditor
          key={user.id}
          profile={user}
          selectedProfileId={user.id}
          onSaved={() => void mutateSelf()}
        />
      )}
      <form className="mt-3 flex flex-col gap-2" onSubmit={handleCreateProfile}>
        <input
          className="w-full rounded-md border border-border px-3 py-2"
          aria-label="プロフィール表示名"
          placeholder="表示名"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={191}
          required
        />
        <input
          className="w-full rounded-md border border-border px-3 py-2"
          aria-label="プロフィールユーザー名"
          placeholder="ユーザー名（3〜32文字）"
          value={newUsername}
          onChange={(event) => setNewUsername(event.target.value)}
          pattern="[A-Za-z0-9_-]{3,32}"
          required
        />
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-2 font-medium disabled:opacity-50"
          disabled={isCreatingProfile || selectionLocked}
        >
          {isCreatingProfile ? "作成中..." : "プロフィールを追加"}
        </button>
        {profileError && <p role="alert">{profileError}</p>}
      </form>
      {isAdmin && (
        <>
          <label htmlFor="account-select" className="account-switcher-label">
            表示アカウント
          </label>
          <select
            id="account-select"
            value={selectedAccountId || ""}
            disabled={selectionLocked}
            onChange={(event) => {
              if (selectionLocked) return;
              setSelectedAccountId(event.target.value || null);
              setSelectedProfileId(null);
            }}
            className="account-switcher-select"
          >
            <option value="">{account?.name}（自分）</option>
            {accountList.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <Link to="/dashboard/admin/accounts" className="mt-3 block underline">
            アカウント管理
          </Link>
          {selectedAccount && (
            <div className="account-switcher-note">
              {selectedAccount.name} を管理中
            </div>
          )}
        </>
      )}
    </div>
  );
};

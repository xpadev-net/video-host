import { useAtomValue, useSetAtom } from "jotai";
import { useLayoutEffect, useRef } from "react";
import { StopPlayerAtom } from "@/atoms/Player";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { authClient } from "@/lib/auth-client";

export const ProfileChangeWatcher = () => {
  const { data: authSession } = authClient.useSession();
  const sessionUserId = authSession?.user.id;
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const stopPlayer = useSetAtom(StopPlayerAtom);
  const previousContextRef = useRef({
    sessionUserId,
    selectedAccountId,
    selectedProfileId,
  });

  useLayoutEffect(() => {
    if (
      previousContextRef.current.sessionUserId === sessionUserId &&
      previousContextRef.current.selectedAccountId === selectedAccountId &&
      previousContextRef.current.selectedProfileId === selectedProfileId
    )
      return;
    previousContextRef.current = {
      sessionUserId,
      selectedAccountId,
      selectedProfileId,
    };
    stopPlayer();
  }, [sessionUserId, selectedAccountId, selectedProfileId, stopPlayer]);

  return null;
};

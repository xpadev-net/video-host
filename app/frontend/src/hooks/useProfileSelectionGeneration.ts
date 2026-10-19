import { useAtomValue } from "jotai";
import { useLayoutEffect, useRef } from "react";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { authClient } from "@/lib/auth-client";

export function useProfileSelectionGeneration(onChange: () => void) {
  const { data: authSession } = authClient.useSession();
  const sessionUserId = authSession?.user.id;
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  const previousSelectionRef = useRef({
    sessionUserId,
    selectedAccountId,
    selectedProfileId,
  });
  const generationRef = useRef(0);
  const onChangeRef = useRef(onChange);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useLayoutEffect(() => {
    const previousSelection = previousSelectionRef.current;
    if (
      previousSelection.sessionUserId === sessionUserId &&
      previousSelection.selectedAccountId === selectedAccountId &&
      previousSelection.selectedProfileId === selectedProfileId
    )
      return;

    previousSelectionRef.current = {
      sessionUserId,
      selectedAccountId,
      selectedProfileId,
    };
    generationRef.current += 1;
    onChangeRef.current();
  }, [sessionUserId, selectedAccountId, selectedProfileId]);

  return { selectedAccountId, selectedProfileId, generationRef };
}

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { StopPlayerAtom } from "@/atoms/Player";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";

export const ProfileChangeWatcher = () => {
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const stopPlayer = useSetAtom(StopPlayerAtom);
  const previousSelectionRef = useRef({ selectedAccountId, selectedProfileId });

  useEffect(() => {
    if (
      previousSelectionRef.current.selectedAccountId === selectedAccountId &&
      previousSelectionRef.current.selectedProfileId === selectedProfileId
    )
      return;
    previousSelectionRef.current = { selectedAccountId, selectedProfileId };
    stopPlayer();
  }, [selectedAccountId, selectedProfileId, stopPlayer]);

  return null;
};

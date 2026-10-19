import { useAtomValue } from "jotai";
import { useLayoutEffect, useRef } from "react";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";

export function useProfileSelectionGeneration(onChange: () => void) {
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  const previousSelectionRef = useRef({ selectedAccountId, selectedProfileId });
  const generationRef = useRef(0);
  const onChangeRef = useRef(onChange);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useLayoutEffect(() => {
    const previousSelection = previousSelectionRef.current;
    if (
      previousSelection.selectedAccountId === selectedAccountId &&
      previousSelection.selectedProfileId === selectedProfileId
    )
      return;

    previousSelectionRef.current = { selectedAccountId, selectedProfileId };
    generationRef.current += 1;
    onChangeRef.current();
  }, [selectedAccountId, selectedProfileId]);

  return { selectedAccountId, selectedProfileId, generationRef };
}

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// Selected account ID for admin account switching
// null = self (admin's own account)
// string = system account ID
export const selectedAccountIdAtom = atomWithStorage<string | null>(
  "dashboard-selected-account",
  null,
);

// Selected account info (populated from system accounts list)
export interface SelectedAccountInfo {
  id: string;
  name: string;
  username: string;
}

export const selectedAccountAtom = atom<SelectedAccountInfo | null>(null);

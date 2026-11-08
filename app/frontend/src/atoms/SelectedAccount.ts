import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// Selected account ID for admin account switching
// null = self (admin's own account)
// string = common account ID
export const selectedAccountIdAtom = atomWithStorage<string | null>(
  "dashboard-selected-account",
  null,
);

// Explicit profile selection on this device. null means no profile is selected.
// The API validates account membership on every profile-dependent request.
export const selectedProfileIdAtom = atomWithStorage<string | null>(
  "dashboard-selected-profile",
  null,
);

// Keep profile/account controls from discarding an active upload form.
export const uploadSelectionLockedAtom = atom(false);

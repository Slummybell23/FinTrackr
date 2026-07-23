import { createContext, useContext } from "react";
import type { AuthUser } from "./types";

/** The signed-in user, so pages can read settings (nudges, targets) without refetching. */
export const UserContext = createContext<AuthUser | null>(null);

export function useUser(): AuthUser | null {
  return useContext(UserContext);
}

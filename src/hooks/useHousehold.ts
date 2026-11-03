"use client";

import { useEffect, useState } from "react";
import type { Household } from "@/types/user";
import { subscribeHousehold } from "@/lib/household";
import { useAuth } from "./useAuth";

/** The signed-in user's household, live. `household` is null when they are not in one. */
export function useHousehold() {
  const { householdId } = useAuth();
  const [state, setState] = useState<{ id: string | null; household: Household | null; error: boolean }>({
    id: null,
    household: null,
    error: false,
  });

  useEffect(() => {
    if (!householdId) return;
    return subscribeHousehold(
      householdId,
      (household) => setState({ id: householdId, household, error: false }),
      () => setState({ id: householdId, household: null, error: true }),
    );
  }, [householdId]);

  const current = householdId && state.id === householdId ? state : null;
  return {
    householdId,
    household: current?.household ?? null,
    loading: Boolean(householdId) && !current,
    error: current?.error ?? false,
  };
}

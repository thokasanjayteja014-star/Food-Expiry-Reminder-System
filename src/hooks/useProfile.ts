"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserProfile } from "@/types/user";
import { DEFAULT_REMINDER_DAYS } from "@/types/product";
import { useAuth } from "./useAuth";

export function useProfile() {
  const { repo, user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!repo) return;
    try {
      setProfile(await repo.getProfile());
    } catch (e) {
      console.error("Failed to load profile", e);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    // Loading external data into state on mount is this effect's purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const update = useCallback(
    async (patch: Partial<UserProfile>) => {
      if (!repo) return;
      await repo.updateProfile(patch);
      setProfile((p) => (p ? { ...p, ...patch } : p));
    },
    [repo],
  );

  return {
    profile,
    loading,
    update,
    reload,
    defaultReminderDays: profile?.defaultReminderDays ?? DEFAULT_REMINDER_DAYS,
    displayName: profile?.name || user?.name || "",
  };
}

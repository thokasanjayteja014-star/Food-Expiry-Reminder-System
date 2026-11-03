"use client";

import { useEffect, useState } from "react";
import type { AppNotification } from "@/types/notification";
import { useAuth } from "./useAuth";
import { FRIENDLY } from "@/lib/errors";

export function useNotifications() {
  const { repo } = useAuth();
  const [state, setState] = useState<{ items: AppNotification[]; loading: boolean; error: string | null }>({
    items: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!repo) return;
    return repo.subscribeNotifications(
      (items) => setState({ items, loading: false, error: null }),
      (error) => {
        console.error("Failed to load notifications", error);
        setState((s) => ({ ...s, loading: false, error: FRIENDLY.generic }));
      },
    );
  }, [repo]);

  return { ...state, unreadCount: state.items.filter((n) => !n.read).length };
}

export type NotificationType = "EXPIRING_SOON" | "EXPIRING_TODAY" | "EXPIRED" | "TEST";

/** Outcome of the push delivery attempt. We never claim "sent" unless the push service accepted it. */
export type PushStatus = "sent" | "no_subscription" | "failed" | "local" | "not_attempted";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  productId: string | null;
  type: NotificationType;
  /** YYYY-MM-DD the reminder was due. */
  scheduledFor: string;
  /** ISO timestamp the push was accepted by the push service, if it was. */
  sentAt: string | null;
  pushStatus: PushStatus;
  read: boolean;
  createdAt: string;
}

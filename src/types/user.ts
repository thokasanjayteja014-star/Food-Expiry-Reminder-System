export type ThemePreference = "light" | "dark" | "system";

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  /** True when the user is exploring the app with local demo data. */
  isDemo: boolean;
}

export interface UserProfile {
  name: string;
  email: string;
  defaultReminderDays: number;
  /** IANA time zone, used by the server to decide which calendar day it is for this user. */
  timeZone: string;
  notificationsEnabled: boolean;
  /** Daily reminder email to the verified sign-in address (on unless turned off). */
  emailReminders: boolean;
  /** The household whose shared food list this user sees, or null for a personal list. Set only by the server. */
  householdId?: string | null;
  createdAt: string;
}

export interface HouseholdMember {
  uid: string;
  name: string;
}

/** A family or flat that shares one food list. Members are managed only by the server. */
export interface Household {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  members: HouseholdMember[];
  inviteCode: string;
}

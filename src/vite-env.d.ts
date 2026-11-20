/// <reference types="vite/client" />

interface PvrsSeedUser {
  email: string;
  name: string;
  emailVerified: boolean;
  uid?: string;
}

interface PvrsSeed {
  user: PvrsSeedUser | null;
  docs?: Record<string, Record<string, unknown>>;
  /** When true, password sign-in requires a TOTP code (tests). */
  mfa?: boolean;
}

interface Window {
  __PVRS_MOCK?: boolean;
  __PVRS_SEED?: PvrsSeed;
}

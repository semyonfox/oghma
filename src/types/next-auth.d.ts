import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    session_version?: number;
  }
  interface Session {
    validationUnavailable?: boolean;
    user: DefaultSession["user"] & {
      id?: string;
      sessionVersion?: number;
      displayName?: string | null;
      avatarUrl?: string | null;
      locale?: string | null;
    };
  }
}

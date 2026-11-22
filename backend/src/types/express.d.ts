import type { UserSummary } from "../modules/auth/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: UserSummary;
    }
  }
}
export {};

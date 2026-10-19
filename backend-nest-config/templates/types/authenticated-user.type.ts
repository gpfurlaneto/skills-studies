import type { Request } from 'express';

/**
 * Verified JWT payload exposed to controllers.
 * `id` is mapped from the standard `sub` claim; any other claim stays available.
 * Align with the claims actually signed by the project's auth module.
 */
export interface AuthenticatedUser {
  id: string;
  [claim: string]: unknown;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

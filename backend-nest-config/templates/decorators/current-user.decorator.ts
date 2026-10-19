import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from '../types/authenticated-user.type.js';

/**
 * Reads the user set by JwtAuthGuard.
 *   @CurrentUser() user: AuthenticatedUser
 *   @CurrentUser('id') userId: string
 * Use only on routes protected by @Auth().
 */
export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) {
      throw new Error('CurrentUser used on a route without JwtAuthGuard');
    }
    return property ? user[property] : user;
  },
);

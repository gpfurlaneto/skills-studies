import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedError } from '{{SHARED_PKG}}';
import type { AuthenticatedRequest } from '../types/authenticated-user.type.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request.headers.authorization);
    if (!token) throw new UnauthorizedError('Missing authentication token');

    try {
      const { sub, ...claims } = await this.jwt.verifyAsync<{ sub?: string } & Record<string, unknown>>(token);
      if (!sub) throw new Error('Missing subject claim');
      request.user = { ...claims, id: String(sub) };
    } catch {
      throw new UnauthorizedError('Invalid or expired authentication token');
    }
    return true;
  }

  private extractToken(header?: string): string | undefined {
    const [scheme, token] = header?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }
}

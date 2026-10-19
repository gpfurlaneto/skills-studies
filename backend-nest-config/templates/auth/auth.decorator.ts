import { UseGuards, applyDecorators } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/** Protects a controller or a single route with JWT authentication. */
export const Auth = () => applyDecorators(UseGuards(JwtAuthGuard));

# Integration snippets

Adjust import suffixes (`.js`) to the backend's module system.

## `apps/backend/src/main.ts`

```ts
import { AllExceptionsFilter } from './shared/index.js';

const app = await NestFactory.create(AppModule);
app.enableCors();
app.useGlobalFilters(new AllExceptionsFilter());
```

(Keep the existing `bootstrap()` structure; just add the filter line.)

## `apps/backend/src/app.module.ts`

```ts
import { SharedAuthModule } from './shared/index.js';

@Module({
  imports: [DbModule, ConfigModule.forRoot({ isGlobal: true }), SharedAuthModule, AuthModule, ReportsModule],
})
```

`ConfigModule` must be global (it is in this project) so `SharedAuthModule` can read `JWT_SECRET`.

## Environment

```
JWT_SECRET=change-me
JWT_EXPIRES_IN=1h
```

## Usage in a controller

```ts
@Auth()
@Controller('reports')
export class ReportsController {
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser, @CurrentUser('id') id: string) {
    return { id, user };
  }
}
```

## Issuing tokens (login use case / controller)

Inject `JwtService` from `@nestjs/jwt` and sign `{ sub: user.id, ...extraClaims }`. Login itself is business logic and is not created by this skill.

## Optional: global guard

Register `{ provide: APP_GUARD, useClass: JwtAuthGuard }` and make the guard honor `IS_PUBLIC_KEY` via `Reflector` (`getAllAndOverride`) returning `true` for `@Public()` routes. Only do this when the user asks.

---
name: backend-nest-config
description: Configura a base compartilhada do backend NestJS com tratamento centralizado de erros, autenticação por JWT, decorators utilitários e infraestrutura comum para endpoints protegidos da aplicação.
---

# Backend Nest Config

## Overview

Creates the shared layer of the NestJS backend in `apps/backend/src/shared/`: a global exception filter that maps the `packages/shared` error hierarchy to a uniform HTTP payload, a JWT guard, a `@CurrentUser()` decorator and the auxiliary types. Controllers stop doing `try/catch` and manual error conversion; they just run the use case.

Everything the skill needs lives in this folder: `templates/` (source files) and `references/integration.md` (wiring snippets).

## Step 1 - Read before writing (mandatory)

Read all of these; adapt templates to what is really there:

1. `packages/shared/src/error/index.ts`, `domain.error.ts`, `validation.error.ts`, `validation.exception.ts` (and any other error class exported, e.g. `UnauthorizedError`, `NotFoundError`).
2. `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`.
3. `apps/backend/src/modules/auth/auth.controller.ts`.
4. Any existing code dealing with auth, token, claims, logged user or request context (`grep -ri "jwt\|token\|claims\|request.user\|APP_GUARD\|APP_FILTER" apps/backend/src`). Reuse what is compatible; never create a duplicate guard, filter or decorator.
5. `apps/backend/package.json` (module system, Nest version, dependencies) and `packages/shared/package.json` (package name and exports).

## Step 2 - Resolve project-specific values

- **Shared package import** (`{{SHARED_PKG}}`): use the package name from `packages/shared/package.json` (e.g. `@poupig/shared`) if it is a dependency of the backend and its entry exports the errors (`export * from './error'` in `src/index.ts`). Never import via relative paths into `dist`. If the entry does not export errors, add the export to `packages/shared/src/index.ts` and rebuild the package.
- **Import suffix**: if the backend is ESM (`"type": "module"` or existing imports end in `.js`), keep `.js` on relative imports as the templates do; otherwise remove the suffix.
- **Env var**: `JWT_SECRET` (and optional `JWT_EXPIRES_IN`, default `1h`). Add to `apps/backend/.env.example` (and `.env` only if it already exists, with a dev value).
- **Dependency**: `@nestjs/jwt` at the version range matching the installed `@nestjs/common` major. Install it in `apps/backend` if missing.
- **Claims**: the guard only requires `sub`. Look at how the existing auth module signs tokens (if it does) and align `AuthenticatedUser` with the real claims; extra claims stay available through the index signature.

## Step 3 - Create the structure

Copy from `templates/` to `apps/backend/src/shared/`, replacing placeholders (`{{SHARED_PKG}}`). Skip or merge any file whose equivalent already exists.

| Template | Destination |
| --- | --- |
| `templates/errors/error-response.type.ts` | `shared/errors/error-response.type.ts` |
| `templates/errors/all-exceptions.filter.ts` | `shared/errors/all-exceptions.filter.ts` |
| `templates/types/authenticated-user.type.ts` | `shared/types/authenticated-user.type.ts` |
| `templates/auth/jwt-auth.guard.ts` | `shared/auth/jwt-auth.guard.ts` |
| `templates/auth/public.decorator.ts` | `shared/auth/public.decorator.ts` |
| `templates/auth/auth.decorator.ts` | `shared/auth/auth.decorator.ts` |
| `templates/auth/shared-auth.module.ts` | `shared/auth/shared-auth.module.ts` |
| `templates/decorators/current-user.decorator.ts` | `shared/decorators/current-user.decorator.ts` |
| `templates/index.ts` | `shared/index.ts` |

## Step 4 - Integrate

Follow `references/integration.md`:

- `main.ts`: `app.useGlobalFilters(new AllExceptionsFilter())`.
- `AppModule`: import `SharedAuthModule` (global; provides `JwtModule` and `JwtAuthGuard`).
- Do NOT make the guard global by default: `POST /auth/register` and login must stay open. Protect routes with `@Auth()` (class or method). Offer the global-guard + `@Public()` variant only if the user asks.

## Step 5 - Remove per-controller error handling

In existing controllers (e.g. `AuthController`), delete `try/catch`, `handleDomainError` and the `HttpException` conversion, and drop the relative `dist` import of `DomainError`/`ValidationException`. Let errors propagate to the filter. Do not change business behavior otherwise.

## Error contract (do not change without updating the frontend)

```json
{
  "statusCode": 422,
  "error": "ValidationException",
  "message": "Validation failed",
  "errors": [{ "message": "..." }],
  "path": "/auth/register",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Mapping order (most specific first): `ValidationException` -> `ValidationError`/other `DomainError` (uses `error.statusCode`) -> Nest `HttpException` -> anything else (500, generic message `Internal server error`, real error only logged). A `DomainError` with `statusCode >= 500` also gets the generic message.

## Step 6 - Verify

1. `npm run build` in `apps/backend` (and `packages/shared` if touched); fix type errors.
2. Smoke test with the app running: invalid register payload returns the structured `errors`; a protected route without token returns 401 with the same shape; with a valid token `@CurrentUser()` returns the user.
3. Optionally add unit tests for the filter and guard next to them (`*.spec.ts`, using the backend's test runner).

## Rules

- Do not recreate an error hierarchy in the backend; only consume `packages/shared`.
- Keep controllers free of auth parsing and error conversion.
- Never log or return tokens, secrets or stack traces to the client.
- Fail fast at startup if `JWT_SECRET` is missing.
- All code, comments and messages are written in English.

---
name: backend-prisma-repository
description: 'Create the Prisma implementation of a domain module repository interface inside the NestJS backend. Use when the request involves explicitly providing a repository interface in `modules/<module>/src/**`, generating the corresponding `*.prisma.ts` file directly in `apps/backend/src/modules/<module>` by default, registering the concrete class in the Nest module with `DbModule` and `PrismaService`, and wiring basic database operations such as `create`, `update`, `delete`, `findById`, and `findPage`.'
---

# Backend Prisma Repository

## Goal

Implement in the NestJS backend the Prisma version of a repository interface defined in a business module inside `modules/`.
This skill works on a single contract per execution and must create the `*.prisma.ts` implementation, register the concrete class in the corresponding Nest module, and ensure use of the `PrismaService` provided by `DbModule`.

## Mandatory lock

- This skill may only run when the target repository interface is explicitly provided.
- Accepted inputs:
  - exact interface name, such as `UserRepository`, when the context unambiguously points to a single file
  - interface file path, such as `modules/auth/src/user/provider/user.repository.ts`
  - equivalent reference that identifies a single repository contract
- If the interface is not provided or there is ambiguity between more than one file, stop immediately.
- In that situation, ask the user which repository interface they want to implement.
- Without this information, do not read files to infer by similarity, do not edit files, and do not register providers.
- This skill must not modify the provided repository interface file or any other domain module file inside `modules/<module>/src/**`.
- This skill must not add, remove, or change exports, tokens, types, methods, imports, or any other part of the original interface.

## Scope

- Read the provided interface inside `modules/<module>/src/**`.
- Infer the module from the actual file path in `modules/<module>/...`.
- Create the Prisma implementation inside `apps/backend/src/modules/<module>`.
- By default, create the file at the root of the backend module, without reproducing domain subfolders, unless the user explicitly asks for a different organization.
- Adjust only the corresponding Nest module and the minimum backend files required for dependency injection to work.
- Never edit the original repository contract as part of this skill.

## Mandatory conventions

- The implementation file must end with `.prisma.ts`.
- The file name must follow the provided repository, removing the `.repository` suffix when present.
  - Example: `user.repository.ts` generates `user.prisma.ts`.
- The backend path must be, by default, the root of the backend module.
  - Example: `modules/auth/src/user/provider/user.repository.ts`
  - Default destination: `apps/backend/src/modules/auth/user.prisma.ts`
- Only create subfolders when the user explicitly asks or when there is an already established local convention that is necessary to avoid breaking the existing module.
- The concrete class must follow the `Prisma<InterfaceName>` pattern.
  - Example: `PrismaUserRepository implements UserRepository`
- The implementation must inject `PrismaService` via the constructor.
- The backend Nest module must import `DbModule`.
- The Nest module must register the concrete Prisma class in `providers`.
- When the module needs to expose this repository to other Nest modules, export the concrete class itself.

## Workflow

1. Validate the mandatory input.
   - Confirm that there is exactly one target interface.
   - Confirm that the file belongs to `modules/<module>/src/`.
   - If this fails, stop.
2. Read the contract and the minimum context.
   - Open the interface file.
   - Read the related types needed to implement the contract safely.
   - When the interface extends `CrudRepository`, read the generics used and the entity, input, and pagination types.
3. Infer destinations and names.
   - Resolve the module from the path in `modules/<module>`.
   - Resolve the backend module at `apps/backend/src/modules/<module>/<module>.module.ts`.
   - Resolve the Prisma file destination at the root of the backend module by default.
   - If the user specifies another path, follow the explicit instruction.
4. Implement the Prisma class.
   - Create the `*.prisma.ts` file in the backend.
   - Inject `PrismaService`.
   - Implement the methods required by the contract.
   - If the interface extends `CrudRepository`, implement at least `create`, `update`, `delete`, `findById`, and `findPage`.
5. Wire into Nest.
   - Update `apps/backend/src/modules/<module>/<module>.module.ts`.
   - Add `DbModule` to `imports`.
   - Register `Prisma<InterfaceName>` directly in `providers`.
   - Export `Prisma<InterfaceName>` when the backend module needs to make the repository available to other modules.
6. Review consumption.
   - In backend Nest classes, prefer direct injection of the concrete class, for example `constructor(private readonly userRepository: PrismaUserRepository)`.
   - When there is a domain use case that depends on the interface, let the concrete class be passed to that use case without changing the domain contract.
   - Do not change pure domain classes that are not part of the Nest injection graph.
7. Report the result.
   - Report the implemented interface, the inferred module, the files created or changed, and any point that needs manual review.

## Implementation rules

- Prioritize contracts that extend `CrudRepository`.
- Map `findPage` to `PageResult<T>` preserving `items`, `page`, `perPage`, and `total`.
- Reuse the Prisma model already existing in the client when it is clearly defined.
- When the Prisma model name cannot be safely inferred from the entity or the existing schema, stop and ask for confirmation instead of inventing the access.
- TypeScript interfaces remain useful as a domain contract, but Nest injection must use the concrete class by default, without requiring a symbolic token.
- Do not put business rules in the Prisma implementation; it must be restricted to persistence and mapping.
- If the entity requires conversion between the domain model and the Prisma payload, create private mapping methods in the same file.
- If the entity has a constructor or factory that must be used to rehydrate the domain, follow the business module itself instead of returning literal objects.

## Database integration

- The implementation must depend on `PrismaService` imported from `apps/backend/src/db/prisma.service`.
- The backend module must depend on `DbModule` imported from `apps/backend/src/db/db.module`.
- Do not instantiate `PrismaClient` directly inside the Prisma repository.
- Do not duplicate connection configuration outside the existing database module.

## Guardrails

- Do not run without the repository interface explicitly provided.
- Do not infer the module without an unambiguous path or contract.
- Do not modify the target interface file or any domain file in `modules/<module>/src/**`.
- Do not edit other backend modules beyond what is necessary for the target repository.
- Do not change the Prisma schema, migrations, seeds, or domain entities as part of this skill, unless the request explicitly includes it.
- Do not require a symbolic token by default for the implementation to work in the backend.
- Do not create subfolders in the backend module without need or without an explicit user request.
- If the contract cannot be implemented with basic Prisma operations alone, report the gap before continuing.

## Expected output

- Prisma implementation created at `apps/backend/src/modules/<module>/<name>.prisma.ts` by default.
- Nest module updated with `DbModule` and with the Prisma class registered in `providers`.
- Nest consumers updated to inject the concrete class when that makes sense in the backend.

## References

- See `references/prisma-repository-implementation.md` for the detailed checklist, path conventions, and a concrete example with `UserRepository`.

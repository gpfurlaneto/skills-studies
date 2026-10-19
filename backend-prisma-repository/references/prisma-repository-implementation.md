# Prisma Implementation Checklist per Interface

## When to read this reference

- When the repository interface has already been provided and the skill needs to turn the contract into a concrete implementation.
- When there is doubt about naming, the mirrored path in the backend, or provider registration in Nest.

## Mandatory input

- Receive an explicit repository interface.
- Valid examples:
  - `UserRepository`
  - `modules/auth/src/user/provider/user.repository.ts`

Without this, the skill must stop.

## Interface no-change lock

- The skill may read the interface to understand the contract, but must not modify that file.
- The skill also must not change the domain `index.ts` or any other file in `modules/<module>/src/**`.
- Injection in the backend must work by default with the concrete Prisma class itself, without requiring a symbolic token.

## Resolution algorithm

1. Resolve the exact interface file.
2. Extract the module name from `modules/<module>/`.
3. Replace the final file `<name>.repository.ts` with `<name>.prisma.ts`.
4. Create the resulting file directly in `apps/backend/src/modules/<module>/` by default.
5. Only use another path when the user explicitly asks.

## Concrete example

Input:

```text
modules/auth/src/user/provider/user.repository.ts
```

Expected outputs:

- business module: `auth`
- backend module: `apps/backend/src/modules/auth/auth.module.ts`
- default implementation file: `apps/backend/src/modules/auth/user.prisma.ts`
- concrete class: `PrismaUserRepository`

## Injection pattern

Since interfaces cannot be injected directly in Nest without a runtime token, the pattern of this skill is to simplify the backend: register and inject the concrete Prisma class.

Recommended example:

```ts
constructor(private readonly userRepository: PrismaUserRepository) {}
```

The `UserRepository` contract remains important in the domain and in the use case, but the backend does not need to create `Symbol(...)` by default when the concrete implementation is already known.

## Prisma file pattern

Skeleton example:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../db/prisma.service';
import { User, UserPageParams, UserRepository } from '@poupig/auth';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: User): Promise<User> {
    const created = await this.prisma.user.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(created);
  }

  async update(data: User): Promise<User> {
    const updated = await this.prisma.user.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({
      where: { id },
    });
  }

  async findById(id: string): Promise<User | null> {
    const found = await this.prisma.user.findUnique({
      where: { id },
    });

    return found ? this.toDomain(found) : null;
  }

  async findPage(params: UserPageParams) {
    const page = Math.max(params.page, 1);
    const perPage = Math.max(params.perPage, 1);
    const skip = (page - 1) * perPage;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return {
      items: items.map((item) => this.toDomain(item)),
      page,
      perPage,
      total,
    };
  }

  private toPersistence(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      password: user.password,
    };
  }

  private toDomain(raw: any): User {
    return new User({
      id: raw.id,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt,
      name: raw.name,
      email: raw.email,
      password: raw.password,
    });
  }
}
```

## Registration in the Nest module

Expected pattern in `apps/backend/src/modules/<module>/<module>.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DbModule } from '../../db/db.module';
import { PrismaUserRepository } from './user.prisma';

@Module({
  imports: [DbModule],
  providers: [PrismaUserRepository],
  exports: [PrismaUserRepository],
})
export class AuthModule {}
```

## Consumption via injection

When a Nest class needs to consume the contract:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaUserRepository } from './user.prisma';

@Injectable()
export class RegisterUserHandler {
  constructor(private readonly userRepository: PrismaUserRepository) {}
}
```

When this handler or controller creates a domain use case, the `PrismaUserRepository` instance itself can be passed to the use case, preserving the `UserRepository` contract without requiring a symbolic token.

## Safety rules

- If the interface file does not belong to `modules/<module>/src/`, stop.
- If there is more than one contract with the same name in different modules, stop and ask for disambiguation.
- If the corresponding Prisma model does not exist and the request does not include a schema change, stop and warn that persistence is not ready yet.
- Do not create a symbolic token by default when direct injection of the concrete class solves the case in the backend.
- Do not create subfolders in the backend without need; the default is the root of `apps/backend/src/modules/<module>/`.
- If the contract has methods beyond basic CRUD, implement only what is clearly defined; the rest must be flagged to the user.

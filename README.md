# api-typer

**End-to-end type-safe APIs for Express — with OpenAPI and TanStack Query (React Query) built in.**

Define your routes once. Get request validation, an OpenAPI spec, and a fully typed TanStack Query client — automatically.

[![npm version](https://img.shields.io/npm/v/@api-typer/core)](https://www.npmjs.com/package/@api-typer/core)
[![license](https://img.shields.io/npm/l/@api-typer/core)](./LICENSE)

---

## Introduction

Building a REST API with Express means writing the route, then the types, then the fetch call, then keeping all three in sync. **api-typer** eliminates that.

You define an Express route with a Zod schema. api-typer validates every incoming request, generates a standards-compliant OpenAPI spec, and produces a fully typed TanStack Query (React Query) client — complete with hooks, direct calls, and cache helpers.

Your route definition *is* the contract. No separate package. No code duplication. No drift.

---

## Highlights

- 🔗 **End-to-end type safety** — inputs, outputs, and errors are fully typed from server to client
- ⚡ **TanStack Query (React Query) client** — typed hooks, direct calls, and cache helpers generated automatically
- 📘 **First-class OpenAPI** — generates a standards-compliant OpenAPI 3.0 spec from your route definitions
- ✅ **Automatic validation** — Zod schemas validated on every request, `422` with structured errors on failure
- 🛟 **Type-safe responses** — `respond('ok', data)` is typed to the exact schema you defined
- 🌿 **Express-native** — drop into any existing Express app, no new framework to learn
- 🚦 **Route conflict detection** — throws at startup if a route would be shadowed by another
- 🔌 **Zero frontend coupling** — the generated client has no runtime dependency on api-typer
- 👀 **Examples** — check out the [`examples/`](./examples) folder to get started quickly

---

## Try it out

Clone the repo and run the example:

```bash
git clone https://github.com/inas-sirhan/api-typer.git
cd api-typer
npm install
npx tsx examples/basic.ts
```

This generates `artifacts/openapi.json` and `artifacts/api.ts` from the example routes.

---

## Install in your project

```bash
npm install @api-typer/core
```

> More documentation coming soon.

---

## Quick start

### 1. Define routes

```ts
import express from 'express';
import * as z from 'zod';
import { createApiBuilder, createSuccessResponse, createErrorResponse } from '@api-typer/core';

const app = express();
app.use(express.json());

const { route, sync } = createApiBuilder(app);

route(
    {
        operationId: 'get-user',
        method: 'get',
        path: '/users/:id',
        summary: 'Get a user by ID',
        tags: ['users'],
        request: z.object({ id: z.string() }),
        responses: {
            ok: createSuccessResponse({
                statusCode: 200,
                schema: z.object({ id: z.string(), name: z.string() }),
            }),
            notFound: createErrorResponse({
                statusCode: 404,
                errorCode: 'USER_NOT_FOUND',
            }),
        },
    },
    async ({ input, respond, req, res }) => {
        // input, respond — typed to your schema
        // req, res — raw Express objects, available when you need them
        const user = await db.findUser(input.id);
        if (!user) return respond('notFound');
        respond('ok', user);
    },
);

await sync({ serverUrl: 'http://localhost:3000' });

app.listen(3000);
```

### 2. What gets generated

Outputs to `./artifacts/`:

| File | Description |
|------|-------------|
| `openapi.json` | OpenAPI 3.0 spec |
| `api.ts` | Typed React Query hooks + `Api` namespace |
| `axios.ts` | Pre-configured Axios instance (generated once, yours to edit — add interceptors, etc.) |

### 3. Use in React

```ts
import { Api, useGetGetUserQueryData, useSetGetUserQueryData } from './artifacts/api';

// Params, response data, and errors are all fully typed
const { data: user, error } = Api.useGetUser({ id: '123' });

// Cache read — typed to the exact response schema
const getUserData = useGetGetUserQueryData();
getUserData({ id: '123' });

// Cache write — updater is typed, wrong shape is a compile error
const setUserData = useSetGetUserQueryData();
setUserData({ id: '123' }, updatedUser);
```

If you rename a route or change its request or response shape, TypeScript will surface every broken call in your frontend.

---

## How it works

```
route()
  │
  ├─▶  Express handler  (Zod validation on every request)
  │
  └─▶  sync()
         │
         ├─▶  openapi.json  (OpenAPI 3.0 spec)
         │
         └─▶  api.ts  (React Query hooks via Orval)
                │
                └─▶  Api.useGetUser(...)
                     Api.createUser(...)
                     Api.deleteUser(...)
```

---

## API Reference

### `createApiBuilder(app, options?)`

| Option | Type | Default |
|--------|------|---------|
| `prefix` | `string` | `'/api'` |

Returns `{ route, sync }`.

---

### `route(config, handler)`

| Field | Type | Description |
|-------|------|-------------|
| `operationId` | `string` | Unique kebab-case ID (e.g. `'get-user'`) |
| `method` | `'get' \| 'post' \| 'put' \| 'patch' \| 'delete'` | HTTP method |
| `path` | `string` | Express path (e.g. `'/users/:id'`) |
| `request` | `ZodObject` | Schema for path params + body/query |
| `responses` | `Record<string, ResponseDef>` | Keyed response definitions |
| `middlewares?` | `RequestHandler[]` | Express middlewares to run before the handler |
| `summary?` | `string` | OpenAPI summary |
| `description?` | `string` | OpenAPI description |
| `tags?` | `string[]` | OpenAPI tags |

---

### `sync(options?)`

| Option | Type | Default |
|--------|------|---------|
| `openApiOutput` | `string` | `'./artifacts'` |
| `clientOutput` | `string` | `'./artifacts'` |
| `serverUrl` | `string` | `'http://localhost:3000'` |

---

### Response helpers

```ts
// Success with a response body
createSuccessResponse({ statusCode, schema, description? })

// Error with a standard { errorCode: string } body
createErrorResponse({ statusCode, errorCode, description? })

// 204 No Content
createSuccessResponseNoContent({ description? })
```

---

## License

MIT

---

v0.1.3 — early release. A more robust and feature-rich version will be released soon — stay tuned.

import express from 'express';
import * as z from 'zod';
import { createApiBuilder, createSuccessResponse, createErrorResponse, createSuccessResponseNoContent } from '../src/index.ts';

const app = express();
app.use(express.json());

// createApiBuilder attaches routes to your Express app.
// The prefix option sets the base path for all routes (default: '/api').
const { route, sync } = createApiBuilder(app);

// Each route has an operationId (kebab-case), method, path, a Zod request schema,
// and a keyed responses map. The handler receives typed `input` and a typed `respond` function.
route(
    {
        operationId: 'get-user',
        method: 'get',
        path: '/users/:id',
        summary: 'Get a user by ID',
        tags: ['users'],
        // Path params (:id) must be included in the request schema.
        // For GET/DELETE routes, all non-path fields become query params.
        request: z.object({ id: z.string() }),
        responses: {
            ok: createSuccessResponse({
                statusCode: 200,
                schema: z.object({ id: z.string(), name: z.string() }),
                description: 'User found.',
            }),
            notFound: createErrorResponse({
                statusCode: 404,
                errorCode: 'USER_NOT_FOUND',
                description: 'No user with the given ID exists.',
            }),
        },
    },
    async ({ input, respond }) => {
        // input is fully typed based on the request schema.
        // respond() is typed per response key — wrong data shape is a compile error.
        respond('ok', { id: input.id, name: 'Alice' });
    },
);

// POST/PUT/PATCH routes: non-path fields are read from the request body.
route(
    {
        operationId: 'create-user',
        method: 'post',
        path: '/users',
        summary: 'Create a user',
        tags: ['users'],
        request: z.object({ name: z.string(), email: z.string() }),
        responses: {
            created: createSuccessResponse({
                statusCode: 201,
                schema: z.object({ id: z.string(), name: z.string(), email: z.string() }),
                description: 'User created.',
            }),
        },
    },
    async ({ input, respond }) => {
        respond('created', { id: '1', name: input.name, email: input.email });
    },
);

// req and res are also available when you need them — e.g. reading headers, setting cookies.
route(
    {
        operationId: 'get-me',
        method: 'get',
        path: '/auth/me',
        summary: 'Get the current user from a session cookie',
        tags: ['users'],
        request: z.object({}),
        responses: {
            ok: createSuccessResponse({
                statusCode: 200,
                schema: z.object({ id: z.string(), name: z.string() }),
                description: 'Current user.',
            }),
            unauthorized: createErrorResponse({
                statusCode: 401,
                errorCode: 'UNAUTHORIZED',
            }),
        },
    },
    async ({ respond, req, res }) => {
        const sessionId = req.cookies?.sessionId;
        if (!sessionId) return respond('unauthorized');
        // res is the raw Express response — set cookies, headers, etc.
        res.cookie('name', 'value');
        respond('ok', { id: '1', name: 'Alice' });
    },
);

// createSuccessResponseNoContent for 204 responses with no body.
route(
    {
        operationId: 'delete-user',
        method: 'delete',
        path: '/users/:id',
        summary: 'Delete a user',
        tags: ['users'],
        request: z.object({ id: z.string() }),
        responses: {
            deleted: createSuccessResponseNoContent({ description: 'User deleted.' }),
            notFound: createErrorResponse({
                statusCode: 404,
                errorCode: 'USER_NOT_FOUND',
                description: 'No user with the given ID exists.',
            }),
        },
    },
    async ({ input, respond }) => {
        console.log('deleting user', input.id);
        respond('deleted');
    },
);

// sync() generates:
//   - openapi.json  — OpenAPI 3.0 spec
//   - api.ts        — typed TanStack Query hooks
//   - axios.ts      — pre-configured Axios instance (only on first run)
await sync({
    openApiOutput: './artifacts/',
    clientOutput: './artifacts/',
    serverUrl: 'http://localhost:3000',
});
// In real projects, gate sync() behind a flag so it doesn't run on every server start:
//   if (process.argv.includes('--sync')) { await sync(...) }
//   tsx server.ts --sync

app.listen(3000, () => console.log('listening on http://localhost:3000'));

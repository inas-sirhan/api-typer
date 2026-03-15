import type { Application, RequestHandler } from 'express';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import * as z from 'zod';
import { isKebabCase, kebabToCamelCase } from '@/orval/transform-utils';
import type { BuilderOptions, SyncOptions, StoredRoute, RouteConfig, RespondFn, HandlerCtx, Responses } from '@/types';

extendZodWithOpenApi(z);

const globalOperationIds = new Set<string>();
const globalRoutes: StoredRoute[] = [];

function extractPathParams(path: string): string[] {
    return path.split('/').filter(s => s.startsWith(':')).map(s => s.slice(1));
}

function getSegments(path: string): string[] {
    return path.split('/').filter(Boolean);
}

function isShadowing(existing: StoredRoute, incoming: StoredRoute): boolean {
    if (existing.method !== incoming.method) return false;
    if (existing.segments.length !== incoming.segments.length) return false;

    for (let i = 0; i < existing.segments.length; i++) {
        const e = existing.segments[i]!;
        const n = incoming.segments[i]!;
        const eIsParam = e.startsWith(':');
        const nIsParam = n.startsWith(':');

        if (!eIsParam && !nIsParam && e !== n) return false;
        if (!eIsParam && nIsParam) return false;
    }

    return true;
}

function generateAxiosTemplate(serverUrl: string): string {
    return `import Axios, { type AxiosRequestConfig } from 'axios';
import qs from 'qs';

export const AXIOS_INSTANCE = Axios.create({
    baseURL: '${serverUrl}',
    withCredentials: true,
    paramsSerializer: (params) => qs.stringify(params, { arrayFormat: 'brackets', allowEmptyArrays: true }),
});

export const customInstance = <T>(
    config: AxiosRequestConfig,
    options?: AxiosRequestConfig,
): Promise<T> => {
    const source = Axios.CancelToken.source();
    const promise = AXIOS_INSTANCE({ ...config, ...options, cancelToken: source.token })
        .then(({ data, status }) => (status === 204 ? null : data))
        .catch((error) => {
            if (Axios.isAxiosError(error) && error.response) throw error.response.data;
            throw error;
        });
    // @ts-ignore
    promise.cancel = () => source.cancel('Query was cancelled');
    return promise;
};

export type ErrorType<Error> = Error;
`;
}

export function createApiBuilder(app: Application, options?: BuilderOptions) {
    const prefix = options?.prefix ?? '/api';

    function route<
        TRequest extends z.ZodObject<z.ZodRawShape>,
        TResponses extends Responses,
    >(
        config: RouteConfig<TRequest, TResponses>,
        fn: (ctx: HandlerCtx<TRequest, TResponses>) => Promise<void>,
    ): void {
        if (!isKebabCase(config.operationId)) {
            throw new Error(`Invalid operationId: "${config.operationId}". Must be kebab-case (e.g. "get-user").`);
        }

        if (globalOperationIds.has(config.operationId)) {
            throw new Error(`Duplicate operationId: "${config.operationId}". Each route must have a unique operationId.`);
        }

        const pathParams = extractPathParams(config.path);
        const schemaKeys = Object.keys(config.request.shape ?? {});
        for (const param of pathParams) {
            if (!schemaKeys.includes(param)) {
                throw new Error(`Route "${config.operationId}": path param ":${param}" is not defined in the request schema.`);
            }
        }

        const incoming: StoredRoute = {
            method: config.method,
            path: config.path,
            operationId: config.operationId,
            segments: getSegments(config.path),
            config,
        };
        for (const existing of globalRoutes) {
            if (isShadowing(existing, incoming)) {
                throw new Error(
                    `Route "${config.operationId}" (${config.method.toUpperCase()} ${config.path}) is shadowed by already-registered route "${existing.operationId}" (${existing.method.toUpperCase()} ${existing.path}). Move "${config.operationId}" before "${existing.operationId}".`,
                );
            }
        }

        globalOperationIds.add(config.operationId);
        globalRoutes.push(incoming);

        const fullPath = `${prefix}${config.path}`;
        const handler: RequestHandler = async (req, res) => {
            const raw = config.method === 'get' || config.method === 'delete'
                ? { ...req.params, ...req.query }
                : { ...req.params, ...req.body };

            const result = config.request.safeParse(raw);
            if (!result.success) {
                res.status(422).json({ errors: result.error.issues });
                return;
            }

            const respond: RespondFn<TResponses> = (key, ...args) => {
                const { statusCode, body } = config.responses[key as string]!.value(...args);
                if (body === null) {
                    res.status(statusCode).send();
                } else {
                    res.status(statusCode).json(body);
                }
            };

            await fn({ input: result.data as z.infer<TRequest>, respond, req, res });
            if (!res.headersSent) {
                throw new Error(`Handler "${config.operationId}" completed without calling respond().`);
            }
        };

        const middlewares = config.middlewares ?? [];
        app[config.method](fullPath, ...middlewares, handler);
    }

    async function sync(options?: SyncOptions): Promise<void> {
        const openApiDir = options?.openApiOutput ?? './artifacts';
        const openApiOutput = join(openApiDir, 'openapi.json');
        const clientOutput = options?.clientOutput ?? './artifacts';

        mkdirSync(openApiDir, { recursive: true });
        mkdirSync(clientOutput, { recursive: true });

        const registry = new OpenAPIRegistry();

        for (const { config } of globalRoutes) {
            const pathParams = extractPathParams(config.path);
            const pathParamsRecord = Object.fromEntries(pathParams.map(p => [p, true as const]));
            const hasPathParams = pathParams.length > 0;

            const openApiRequest: Exclude<Parameters<OpenAPIRegistry['registerPath']>[0]['request'], undefined> = {};

            if (hasPathParams) {
                openApiRequest.params = config.request.pick(pathParamsRecord);
            }

            const schemaWithoutPathParams: z.ZodObject<z.ZodRawShape> = hasPathParams
                ? config.request.omit(pathParamsRecord)
                : config.request;

            const isEmpty = Object.keys(schemaWithoutPathParams.shape).length === 0;

            if (!isEmpty) {
                if (config.method === 'get' || config.method === 'delete') {
                    openApiRequest.query = schemaWithoutPathParams;
                } else {
                    openApiRequest.body = {
                        content: { 'application/json': { schema: schemaWithoutPathParams } },
                        required: true,
                    };
                }
            }

            const byStatus: Record<string, { description: string; schema: z.ZodTypeAny }> = {};
            for (const [key, responseDef] of Object.entries(config.responses as Responses)) {
                const statusCode = String(responseDef.schema.shape.statusCode.value);
                const bodySchema = responseDef.schema.shape.body;
                const description = responseDef.description ?? key;

                if (byStatus[statusCode] !== undefined) {
                    byStatus[statusCode] = {
                        description: byStatus[statusCode]!.description + '\n- ' + description,
                        schema: z.union([byStatus[statusCode]!.schema, bodySchema] as [z.ZodTypeAny, z.ZodTypeAny]),
                    };
                } else {
                    byStatus[statusCode] = { description: '- ' + description, schema: bodySchema };
                }
            }

            const openApiResponses: Parameters<OpenAPIRegistry['registerPath']>[0]['responses'] = {};
            for (const [statusCode, { description, schema }] of Object.entries(byStatus)) {
                if (statusCode === '204' || schema instanceof z.ZodNull) {
                    openApiResponses[statusCode] = { description };
                } else {
                    openApiResponses[statusCode] = {
                        description,
                        content: { 'application/json': { schema } },
                    };
                }
            }

            const openApiPath = config.path.replace(/:(\w+)/g, '{$1}');

            registry.registerPath({
                method: config.method,
                path: openApiPath,
                operationId: kebabToCamelCase(config.operationId),
                summary: config.summary ?? '',
                description: config.description ?? config.summary ?? '',
                tags: config.tags ?? [],
                request: openApiRequest,
                responses: openApiResponses,
            });
        }

        const generator = new OpenApiGeneratorV3(registry.definitions);
        const doc = generator.generateDocument({
            openapi: '3.0.0',
            info: { title: 'API', version: '1.0.0' },
            servers: [{ url: options?.serverUrl ?? 'http://localhost:3000' }],
        });

        writeFileSync(openApiOutput, JSON.stringify(doc, null, 2));
        console.log(`[api-typer] openapi.json written to ${openApiOutput}`);

        const axiosOutputPath = join(clientOutput, 'axios.ts');
        if (!existsSync(axiosOutputPath)) {
            writeFileSync(axiosOutputPath, generateAxiosTemplate(options?.serverUrl ?? 'http://localhost:3000'));
            console.log(`[api-typer] axios.ts written to ${axiosOutputPath}`);
        }

        const getOperationIds: string[] = [];
        const allOperationIds: string[] = [];

        const originalLog = console.log;
        const originalInfo = console.info;
        console.log = () => {};
        console.info = () => {};

        const { generate: orvalGenerate } = await import('orval');
        const { postProcessApi } = await import('@/orval/react-query-transforms');

        try {
            await orvalGenerate({
                input: openApiOutput,
                output: {
                    target: join(clientOutput, 'api.ts'),
                    client: 'react-query',
                    httpClient: 'axios',
                    prettier: false,
                    urlEncodeParameters: true,
                    override: {
                        query: { version: 5 },
                        mutator: { path: axiosOutputPath, name: 'customInstance' },
                        useNamedParameters: true,
                        transformer: (operation) => {
                            allOperationIds.push(operation.operationName);
                            if (operation.verb.toLowerCase() === 'get') {
                                getOperationIds.push(operation.operationName);
                            }
                            return operation;
                        },
                    },
                },
                hooks: {
                    afterAllFilesWrite: () => {
                        postProcessApi(getOperationIds, allOperationIds, join(clientOutput, 'api.ts'));
                    },
                },
            });
        } finally {
            console.log = originalLog;
            console.info = originalInfo;
        }

        console.log(`[api-typer] api.ts written to ${join(clientOutput, 'api.ts')}`);
        console.log(`[api-typer] done`);
    }

    return { route, sync };
}

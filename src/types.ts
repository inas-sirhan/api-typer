import type { Request, Response, RequestHandler } from 'express';
import * as z from 'zod';


type ResponseBodySchema = z.ZodType<Record<string, unknown>>;

export type ResponseSchemaShape = {
    statusCode: z.ZodLiteral<number>;
    body: ResponseBodySchema | z.ZodNull;
};

export type ResponseDef = {
    schema: z.ZodObject<ResponseSchemaShape>;
    value: (...args: any[]) => { statusCode: number; body: unknown };
    description?: string;
};

export type Responses = Record<string, ResponseDef>;

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type RouteConfig<
    TRequest extends z.ZodObject<z.ZodRawShape>,
    TResponses extends Responses,
> = {
    operationId: string;
    method: HttpMethod;
    path: string;
    request: TRequest;
    responses: TResponses;
    middlewares?: RequestHandler[];
    summary?: string;
    description?: string;
    tags?: string[];
};

export type RespondFn<TResponses extends Responses> = <K extends keyof TResponses & string>(
    key: K,
    ...args: Parameters<TResponses[K]['value']>
) => void;

export type HandlerCtx<
    TRequest extends z.ZodObject<z.ZodRawShape>,
    TResponses extends Responses,
> = {
    input: z.infer<TRequest>;
    respond: RespondFn<TResponses>;
    req: Request;
    res: Response;
};

export type BuilderOptions = {
    prefix?: string;
};

export type StoredRoute = {
    method: HttpMethod;
    path: string;
    operationId: string;
    segments: string[];
    config: RouteConfig<any, any>;
};

export type SyncOptions = {
    openApiOutput?: string;
    clientOutput?: string;
    serverUrl?: string;
};

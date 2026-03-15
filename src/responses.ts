import * as z from 'zod';
import type { ResponseSchemaShape, Responses } from '@/types';


type ResponseBodySchema = z.ZodType<Record<string, unknown>>;

export type { Responses };

export function createSuccessResponse<
    const TStatusCode extends number,
    TBodySchema extends ResponseBodySchema,
>(params: {
    statusCode: TStatusCode;
    schema: TBodySchema;
    description?: string;
}) {
    const { statusCode, schema, description } = params;

    const zodSchema = z.object({
        statusCode: z.literal(statusCode),
        body: schema,
    } satisfies ResponseSchemaShape);

    const value = (data: z.infer<TBodySchema>) => ({ statusCode, body: data });

    return { schema: zodSchema, value, ...(description !== undefined && { description }) };
}

export function createErrorResponse<
    const TStatusCode extends number,
    const TErrorCode extends string,
>(params: {
    statusCode: TStatusCode;
    errorCode: TErrorCode;
    description?: string;
}) {
    const { statusCode, errorCode, description } = params;

    const zodSchema = z.object({
        statusCode: z.literal(statusCode),
        body: z.object({ errorCode: z.literal(errorCode) }),
    } satisfies ResponseSchemaShape);

    const value = () => ({ statusCode, body: { errorCode } });

    return { schema: zodSchema, value, ...(description !== undefined && { description }) };
}

export function createSuccessResponseNoContent(params?: { description?: string }) {
    const statusCode = 204 as const;

    const zodSchema = z.object({
        statusCode: z.literal(statusCode),
        body: z.null(),
    } satisfies ResponseSchemaShape);

    const value = () => ({ statusCode, body: null });

    return { schema: zodSchema, value, ...(params?.description !== undefined && { description: params.description }) };
}

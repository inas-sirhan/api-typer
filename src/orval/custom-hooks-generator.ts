import { writeFileSync } from 'fs';
import { toPascal } from '@/orval/transform-utils';
import { queryKeyParamsCache } from '@/orval/cache';


export function generateCustomHooks(operationIds: string[]): string {
    const hooks = operationIds.map((id: string) => {
        const pascalId = toPascal(id);
        const getterHookName = `useGet${pascalId}QueryData`;
        const setterHookName = `useSet${pascalId}QueryData`;
        const queryKeyFn = `get${pascalId}QueryKey`;

        const cached = queryKeyParamsCache.get(id);
        if (cached === undefined) {
            throw new Error(`Query key params not cached for ${id}`);
        }

        const { parameters, paramNames } = cached;

        const hasParams = parameters.length > 0;
        const paramsArg = hasParams ? `${parameters}, ` : '';

        return `

        export type ${pascalId}QueryData = DeepExpand<Awaited<ReturnType<typeof ${id}>>>;

        export const ${getterHookName} = () => {
            const queryClient = useQueryClient();

            return (${parameters}) => queryClient.getQueryData<${pascalId}QueryData>(${queryKeyFn}(${paramNames.join(', ')}));
        };

        export const ${setterHookName} = () => {
            const queryClient = useQueryClient();

            return (
            ${paramsArg}updater:
                | DeepExpand<Awaited<ReturnType<typeof ${id}>>>
                | undefined
                | ((
                    old: DeepExpand<Awaited<ReturnType<typeof ${id}>>> | undefined
                ) => DeepExpand<Awaited<ReturnType<typeof ${id}>>> | undefined)
            ) => {
            queryClient.setQueryData(${queryKeyFn}(${paramNames.join(', ')}), updater);
            };
        };

        `;
    }).join('\n');

    return `


import { useQueryClient } from '@tanstack/react-query';

${hooks}


`;
}


export function generateApiNamespace(allOperationIds: string[], apiFilePath: string): void {
    const allHooks = allOperationIds.map(id => `use${toPascal(id)}`);

    const apiObject = `
export const Api = {
    ${allHooks.join(',\n    ')}
} as const;
`;

    writeFileSync(apiFilePath, apiObject, { flag: 'a' });
}

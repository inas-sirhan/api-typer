import { type TypeAliasDeclaration } from 'ts-morph';
import { type Transform } from '@/orval/transform-utils';


export function removeTypeAliasExports(typeAliases: TypeAliasDeclaration[], content: string, transforms: Transform[]): void {
    for (const typeAlias of typeAliases) {
        const name = typeAlias.getName();
        if (name.endsWith('QueryError') === true) {
            continue;
        }

        const EXPORT_LENGTH = 'export '.length;
        const pos = typeAlias.getStart();
        if (content.slice(pos, pos + EXPORT_LENGTH) !== 'export ') {
            continue;
        }

        transforms.push({ start: pos, end: pos + EXPORT_LENGTH, newText: '' });
    }
}

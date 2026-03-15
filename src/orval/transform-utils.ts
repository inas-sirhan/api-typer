export interface Transform {
    start: number;
    end: number;
    newText: string;
}

export function removeDuplicateTransforms(transforms: Transform[]): Transform[] {
    const seen = new Map<string, Transform>();
    for (const t of transforms) {
        const key = `${t.start}-${t.end}`;
        if (seen.has(key) === false) {
            seen.set(key, t);
        }
    }
    return Array.from(seen.values());
}

export function applyTransforms(content: string, transforms: Transform[]): string {
    const sortedTransforms = [...transforms].sort((a, b) => a.start - b.start);

    const parts: string[] = [];
    let lastEnd = 0;

    for (const t of sortedTransforms) {
        if (t.start < lastEnd) {
            continue;
        }
        parts.push(content.slice(lastEnd, t.start));
        parts.push(t.newText);
        lastEnd = t.end;
    }
    parts.push(content.slice(lastEnd));

    return parts.join('');
}

export function toPascal(operationName: string): string {
    return operationName.charAt(0).toUpperCase() + operationName.slice(1);
}

export function isKebabCase(str: string): boolean {
    return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(str);
}

export function kebabToCamelCase(kebab: string): string {
    const pascal = kebab
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

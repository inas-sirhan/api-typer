import { SyntaxKind, type ArrowFunction, type SourceFile, type TypeAliasDeclaration, type TypeParameterDeclaration, type VariableDeclaration, type FunctionDeclaration } from 'ts-morph';
import { type Transform } from '@/orval/transform-utils';


export function addDeepExpandType(sourceFile: SourceFile, transforms: Transform[]): void {
    const lastImport = sourceFile.getImportDeclarations().at(-1);
    if (lastImport === undefined) {
        return;
    }

    const insertPos = lastImport.getEnd();
    transforms.push({
        start: insertPos,
        end: insertPos,
        newText: `

type DeepExpand<T> = T extends readonly (infer U)[]
    ? DeepExpand<U>[]
    : T extends object
      ? T extends infer O ? { [K in keyof O]: DeepExpand<O[K]> } : never
      : T;
`
    });
}


export function wrapQueryErrorTypes(typeAliases: TypeAliasDeclaration[], transforms: Transform[]): void {
    for (const typeAlias of typeAliases) {
        const name = typeAlias.getName();
        if (name.endsWith('QueryError') === false) {
            continue;
        }

        const typeNode = typeAlias.getTypeNode();
        if (typeNode === undefined) {
            continue;
        }

        const typeText = typeNode.getText();
        if (typeText.startsWith('ErrorType<') === true) {
            transforms.push({
                start: typeNode.getStart(),
                end: typeNode.getEnd(),
                newText: `DeepExpand<${typeText}>`
            });
        }
    }
}


export function transformArrowFunctionTypeParams(varDeclarations: VariableDeclaration[], transforms: Transform[], queryKeyFnNames: Set<string>): void {
    for (const varDecl of varDeclarations) {
        const varName = varDecl.getName();
        if (queryKeyFnNames.has(varName) === true) {
            continue;
        }

        const initializer = varDecl.getInitializer();
        if (initializer === undefined || initializer.isKind(SyntaxKind.ArrowFunction) === false) {
            continue;
        }

        const arrowFn = initializer as ArrowFunction;
        const params = arrowFn.getParameters();

        if (params.length >= 2) {
            const firstParamTypeNode = params[0].getTypeNode();
            const secondParamTypeNode = params[1].getTypeNode();
            const firstParamType = firstParamTypeNode !== undefined ? firstParamTypeNode.getText() : '';
            const secondParamType = secondParamTypeNode !== undefined ? secondParamTypeNode.getText() : '';
            if (firstParamType.includes('PathParameters') === true &&
                (secondParamType.includes('Body') === true || secondParamType.includes('Params') === true)) {
                continue;
            }
        }

        wrapTypeParamsWithDeepExpand(arrowFn.getTypeParameters(), transforms);
    }
}


export function transformFunctionDeclarationTypeParams(functions: FunctionDeclaration[], transforms: Transform[], queryKeyFnNames: Set<string>): void {
    for (const funcDecl of functions) {
        const funcName = funcDecl.getName();
        const funcNameStr = funcName !== undefined ? funcName : '';
        if (queryKeyFnNames.has(funcNameStr) === true) {
            continue;
        }

        const overloads = funcDecl.getOverloads();
        const allDecls = [...overloads, funcDecl];

        for (const decl of allDecls) {
            const params = decl.getParameters();

            if (params.length >= 2) {
                const firstParamTypeNode = params[0].getTypeNode();
                const secondParamTypeNode = params[1].getTypeNode();
                const firstParamType = firstParamTypeNode !== undefined ? firstParamTypeNode.getText() : '';
                const secondParamType = secondParamTypeNode !== undefined ? secondParamTypeNode.getText() : '';
                if (firstParamType.includes('PathParameters') === true &&
                    (secondParamType.includes('Body') === true || secondParamType.includes('Params') === true)) {
                    continue;
                }
            }

            wrapTypeParamsWithDeepExpand(decl.getTypeParameters(), transforms);
        }
    }
}


export function wrapTypeParamsWithDeepExpand(typeParams: TypeParameterDeclaration[], transforms: Transform[]): void {
    for (const typeParam of typeParams) {
        const defaultNode = typeParam.getDefault();
        if (defaultNode === undefined) {
            continue;
        }

        const defaultText = defaultNode.getText();
        const paramName = typeParam.getName();

        if (paramName === 'TData' && defaultText.startsWith('Awaited<ReturnType<') === true) {
            transforms.push({
                start: defaultNode.getStart(),
                end: defaultNode.getEnd(),
                newText: `DeepExpand<${defaultText}>`
            });
        }
        if (paramName === 'TError' && defaultText.startsWith('ErrorType<') === true) {
            transforms.push({
                start: defaultNode.getStart(),
                end: defaultNode.getEnd(),
                newText: `DeepExpand<${defaultText}>`
            });
        }
    }
}

import { readFileSync, writeFileSync } from 'fs';
import { Project, type VariableDeclaration } from 'ts-morph';
import { type Transform, removeDuplicateTransforms, applyTransforms, toPascal } from '@/orval/transform-utils';
import { removeTypeAliasExports } from '@/orval/export-transforms';
import { addDeepExpandType, wrapQueryErrorTypes, transformArrowFunctionTypeParams, transformFunctionDeclarationTypeParams } from '@/orval/deep-expand-transforms';
import { transformArrowFunctionParams, transformFunctionDeclarationParams, transformTypeLiterals, transformVarStatements, transformCallExpressions } from '@/orval/param-merging-transforms';
import { generateCustomHooks, generateApiNamespace } from '@/orval/custom-hooks-generator';
import { queryKeyParamsCache } from '@/orval/cache';


export function cacheQueryKeyParams(varDeclarations: VariableDeclaration[], getOperationIds: string[]): void {
    for (const id of getOperationIds) {
        const queryKeyFn = `get${toPascal(id)}QueryKey`;
        const varDecl = varDeclarations.find(v => v.getName() === queryKeyFn);

        if (varDecl === undefined) {
            continue;
        }

        const initializer = varDecl.getInitializer();
        if (initializer === undefined) {
            continue;
        }

        const parameters = initializer.getParameters().map(p => p.getText().replace(/\?/g, ''));
        const paramNames = parameters.map((param: string) => param.split(':')[0].replace(/\n/g, '').replace(/\?/g, ''));

        queryKeyParamsCache.set(id, { parameters, paramNames });
    }
}


export function postProcessApi(getOperationIds: string[], allOperationIds: string[], apiFilePath: string): void {
    let content = readFileSync(apiFilePath, 'utf-8');

    content = content.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');
    content = content.replace(/^\s*\/\/.*\n/gm, '');

    const project = new Project({
        useInMemoryFileSystem: true,
        skipLoadingLibFiles: true,
    });
    const sourceFile = project.createSourceFile('api.react-query.ts', content);

    const transforms: Transform[] = [];

    const typeAliases = sourceFile.getTypeAliases();
    const varDeclarations = sourceFile.getVariableDeclarations();
    const functions = sourceFile.getFunctions();

    cacheQueryKeyParams(varDeclarations, getOperationIds);

    const queryKeyFnNames = new Set(
        getOperationIds.map(id => `get${toPascal(id)}QueryKey`)
    );

    removeTypeAliasExports(typeAliases, content, transforms);
    addDeepExpandType(sourceFile, transforms);
    wrapQueryErrorTypes(typeAliases, transforms);
    transformArrowFunctionParams(varDeclarations, transforms, queryKeyFnNames);
    transformArrowFunctionTypeParams(varDeclarations, transforms, queryKeyFnNames);
    transformFunctionDeclarationParams(functions, transforms, queryKeyFnNames);
    transformFunctionDeclarationTypeParams(functions, transforms, queryKeyFnNames);
    transformTypeLiterals(sourceFile, transforms);
    transformVarStatements(sourceFile, transforms);
    transformCallExpressions(sourceFile, transforms, queryKeyFnNames);

    const uniqueTransforms = removeDuplicateTransforms(transforms);
    content = applyTransforms(content, uniqueTransforms);

    content = `/* eslint-disable */\n// @ts-nocheck\n${content}`;

    writeFileSync(apiFilePath, content);

    const generatedHooks = generateCustomHooks(getOperationIds);
    writeFileSync(apiFilePath, generatedHooks, { flag: 'a' });

    generateApiNamespace(allOperationIds, apiFilePath);
}

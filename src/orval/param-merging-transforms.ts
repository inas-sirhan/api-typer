import { SyntaxKind, type ArrowFunction, type SourceFile, type VariableDeclaration, type FunctionDeclaration } from 'ts-morph';
import { type Transform } from '@/orval/transform-utils';
import { wrapTypeParamsWithDeepExpand } from '@/orval/deep-expand-transforms';


export function transformArrowFunctionParams(varDeclarations: VariableDeclaration[], transforms: Transform[], queryKeyFnNames: Set<string>): void {
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

        if (params.length < 2) {
            continue;
        }

        const firstParam = params[0];
        const secondParam = params[1];

        const firstParamTypeNode = firstParam.getTypeNode();
        const secondParamTypeNode = secondParam.getTypeNode();
        const firstParamType = firstParamTypeNode !== undefined ? firstParamTypeNode.getText() : '';
        const secondParamType = secondParamTypeNode !== undefined ? secondParamTypeNode.getText() : '';

        if (firstParamType.includes('PathParameters') === false) {
            continue;
        }

        const isBody = secondParamType.includes('Body');
        const isParams = secondParamType.includes('Params');
        if (isBody === false && isParams === false) {
            continue;
        }

        const bindingPattern = firstParam.getNameNode();
        if (bindingPattern.isKind(SyntaxKind.ObjectBindingPattern) === false) {
            continue;
        }

        const pathParamNames = bindingPattern.getElements().map(el => el.getName());
        const secondParamName = secondParam.getName();

        const newBindingPattern = `{ ${pathParamNames.join(', ')}, ...${secondParamName} }`;
        const newType = `${firstParamType} & ${secondParamType}`;
        const newParamText = `${newBindingPattern}: ${newType}`;

        transforms.push({
            start: firstParam.getStart(),
            end: secondParam.getEnd(),
            newText: newParamText
        });

        wrapTypeParamsWithDeepExpand(arrowFn.getTypeParameters(), transforms);
    }
}


export function transformFunctionDeclarationParams(functions: FunctionDeclaration[], transforms: Transform[], queryKeyFnNames: Set<string>): void {
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
            if (params.length < 2) {
                continue;
            }

            const firstParam = params[0];
            const secondParam = params[1];

            const firstParamTypeNode = firstParam.getTypeNode();
            const secondParamTypeNode = secondParam.getTypeNode();
            const firstParamType = firstParamTypeNode !== undefined ? firstParamTypeNode.getText() : '';
            const secondParamType = secondParamTypeNode !== undefined ? secondParamTypeNode.getText() : '';

            if (firstParamType.includes('PathParameters') === false) {
                continue;
            }

            const isBody = secondParamType.includes('Body');
            const isParams = secondParamType.includes('Params');
            if (isBody === false && isParams === false) {
                continue;
            }

            const firstParamNameNode = firstParam.getNameNode();
            const secondParamName = secondParam.getName();
            const cleanSecondType = secondParamType.replace(/undefined \| /g, '').replace(/ \| undefined/g, '');

            if (firstParamNameNode.isKind(SyntaxKind.ObjectBindingPattern) === true) {
                const pathParamNames = firstParamNameNode.getElements().map(el => el.getName());
                const newBindingPattern = `{ ${pathParamNames.join(', ')}, ...${secondParamName} }`;
                const newType = `${firstParamType} & ${cleanSecondType}`;
                const newParamText = `${newBindingPattern}: ${newType}`;

                transforms.push({
                    start: firstParam.getStart(),
                    end: secondParam.getEnd(),
                    newText: newParamText
                });
            } else if (firstParamNameNode.isKind(SyntaxKind.Identifier) === true) {
                const newType = `${firstParamType} & ${cleanSecondType}`;
                const newParamText = `props: ${newType}`;

                transforms.push({
                    start: firstParam.getStart(),
                    end: secondParam.getEnd(),
                    newText: newParamText
                });
            }

            wrapTypeParamsWithDeepExpand(decl.getTypeParameters(), transforms);
        }
    }
}


export function transformTypeLiterals(sourceFile: SourceFile, transforms: Transform[]): void {
    const typeLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.TypeLiteral);

    for (const typeLiteral of typeLiterals) {
        const members = typeLiteral.getMembers();
        if (members.length < 1 || members.length > 2) {
            continue;
        }

        const props = members.map(m => {
            if (m.isKind(SyntaxKind.PropertySignature) === true) {
                const typeNode = m.getTypeNode();
                return { name: m.getName(), type: typeNode !== undefined ? typeNode.getText() : '' };
            }
            return null;
        }).filter((x): x is { name: string; type: string } => x !== null);

        if (props.length !== members.length) {
            continue;
        }

        const pathParamsProp = props.find(p => p.name === 'pathParams' && p.type.includes('PathParameters') === true);
        const dataProp = props.find(p => p.name === 'data' && p.type.includes('Body') === true);
        const paramsProp = props.find(p => p.name === 'params' && p.type.includes('Params') === true);

        const matchedProps = [pathParamsProp, dataProp, paramsProp].filter((x): x is { name: string; type: string } => x !== undefined);

        if (matchedProps.length !== members.length) {
            continue;
        }

        const newType = matchedProps.map(p => p.type).join(' & ');

        transforms.push({
            start: typeLiteral.getStart(),
            end: typeLiteral.getEnd(),
            newText: newType
        });
    }
}


export function transformVarStatements(sourceFile: SourceFile, transforms: Transform[]): void {
    const varStatements = sourceFile.getDescendantsOfKind(SyntaxKind.VariableStatement);

    for (const varStmt of varStatements) {
        const text = varStmt.getText();
        if (text.includes('props') === false) {
            continue;
        }

        const hasPathParams = text.includes('pathParams');
        const hasData = text.includes('data');
        const hasParams = text.includes('params');

        if (hasPathParams === false && hasData === false && hasParams === false) {
            continue;
        }

        const decl = varStmt.getDeclarationList().getDeclarations()[0];
        if (decl === undefined) {
            continue;
        }

        const bindingPattern = decl.getNameNode();
        if (bindingPattern.isKind(SyntaxKind.ObjectBindingPattern) === false) {
            continue;
        }

        const elements = bindingPattern.getElements();
        const names = elements.map(e => e.getName());

        const nextSibling = varStmt.getNextSibling();
        if (nextSibling === undefined || nextSibling.isKind(SyntaxKind.ReturnStatement) === false) {
            continue;
        }

        const returnStmt = nextSibling.asKind(SyntaxKind.ReturnStatement);
        if (returnStmt === undefined) {
            continue;
        }

        const callExpr = returnStmt.getExpression();
        if (callExpr === undefined || callExpr.isKind(SyntaxKind.CallExpression) === false) {
            continue;
        }

        const callExpression = callExpr.asKind(SyntaxKind.CallExpression);
        if (callExpression === undefined) {
            continue;
        }

        const funcExpr = callExpression.getExpression();
        if (funcExpr.isKind(SyntaxKind.Identifier) === false) {
            continue;
        }
        const funcNameText = funcExpr.getText();

        const args = callExpression.getArguments();

        if (names.includes('pathParams') === true && names.includes('data') === true && args.length === 3) {
            if (args[0].getText() === 'pathParams' && args[1].getText() === 'data') {
                const optionsArg = args[2].getText();
                transforms.push({
                    start: varStmt.getStart(),
                    end: nextSibling.getEnd(),
                    newText: `return ${funcNameText}(props, ${optionsArg})`
                });
                continue;
            }
        }

        if (names.length === 1 && args.length === 2) {
            const singleName = names[0];
            if ((singleName === 'pathParams' || singleName === 'data' || singleName === 'params') && args[0].getText() === singleName) {
                const optionsArg = args[1].getText();
                transforms.push({
                    start: varStmt.getStart(),
                    end: nextSibling.getEnd(),
                    newText: `return ${funcNameText}(props, ${optionsArg})`
                });
                continue;
            }
        }
    }
}


export function transformCallExpressions(sourceFile: SourceFile, transforms: Transform[], queryKeyFnNames: Set<string>): void {
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const callExpr of callExpressions) {
        const funcExpr = callExpr.getExpression();
        if (funcExpr.isKind(SyntaxKind.Identifier) === false) {
            continue;
        }
        const funcNameText = funcExpr.getText();

        if (queryKeyFnNames.has(funcNameText) === true) {
            continue;
        }

        const args = callExpr.getArguments();
        if (args.length < 2) {
            continue;
        }

        const firstArg = args[0];
        const secondArg = args[1];

        if (firstArg.isKind(SyntaxKind.ObjectLiteralExpression) === false) {
            continue;
        }
        if (secondArg.isKind(SyntaxKind.Identifier) === false) {
            continue;
        }
        if (secondArg.getText() !== 'params') {
            continue;
        }

        const props = firstArg.getProperties();
        const propNames = props.map(p => {
            if (p.isKind(SyntaxKind.ShorthandPropertyAssignment) === true) {
                return p.getName();
            }
            return null;
        }).filter((x): x is string => x !== null);

        if (propNames.length === 0) {
            continue;
        }

        const newFirstArg = `{ ${propNames.join(', ')}, ...params }`;
        const remainingArgs = args.slice(2).map(a => a.getText());
        const newArgsText = [newFirstArg, ...remainingArgs].join(', ');

        transforms.push({
            start: callExpr.getStart(),
            end: callExpr.getEnd(),
            newText: `${funcNameText}(${newArgsText})`
        });
    }
}

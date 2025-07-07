import fs from 'fs';
import path from 'path';
import { ALL_SCALARS } from "./constant";

function writeScalarResolvers(outputDir: string, useJS: boolean, requiredScalars: Set<keyof typeof ALL_SCALARS>) {
    if (requiredScalars.size === 0) {
        const emptyContent = useJS ? 'module.exports.scalarResolvers = {};' : 'export const scalarResolvers = {};';
        fs.writeFileSync(path.join(outputDir, `scalarResolvers${useJS ? '.js' : '.ts'}`), emptyContent);
        return;
    }

    const ext = useJS ? '.js' : '.ts';
    const neededImports = Array.from(requiredScalars).map(s => ALL_SCALARS[s]);
    const resolverEntries = Array.from(requiredScalars).map(s => `  ${s}: ${ALL_SCALARS[s]},`);

    const content = useJS
        ? `const { ${neededImports.join(', ')} } = require('graphql-scalars');

module.exports.scalarResolvers = {
${resolverEntries.join('\n')}
};`
        : `import {
  ${neededImports.join(',\n  ')}
} from 'graphql-scalars';

export const scalarResolvers = {
${resolverEntries.join('\n')}
};`;

    fs.writeFileSync(path.join(outputDir, `scalarResolvers${ext}`), content.trim());
}


function combiningResolverAndGraphQL(outputDir: string, useJS: boolean) {
    const ext = useJS ? '.js' : '.ts';
    const resolverExt = useJS ? 'Resolver.js' : 'Resolver.ts';

    const content = useJS
        ? `const path = require('path');
const { loadFilesSync } = require('@graphql-tools/load-files');
const { mergeTypeDefs, mergeResolvers } = require('@graphql-tools/merge');
const { scalarResolvers } = require('./scalarResolvers');

const typesArray = loadFilesSync(path.join(__dirname, './**/*.graphql'));
const resolversArray = loadFilesSync(path.join(__dirname, './**/*${resolverExt}'));

const typeDefs = mergeTypeDefs(typesArray);
const resolvers = mergeResolvers([scalarResolvers, ...resolversArray]);

module.exports = {
  typeDefs,
  resolvers
};`
        : `import path from 'path';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { scalarResolvers } from './scalarResolvers';

const typesArray = loadFilesSync(path.join(__dirname, './**/*.graphql'));
const resolversArray = loadFilesSync(path.join(__dirname, './**/*${resolverExt}'));

export const typeDefs = mergeTypeDefs(typesArray);
export const resolvers = mergeResolvers([scalarResolvers, ...resolversArray]);
`;

    fs.writeFileSync(path.join(outputDir, `index${ext}`), content.trim());
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}


export {writeScalarResolvers, capitalize,combiningResolverAndGraphQL}
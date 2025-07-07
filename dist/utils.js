"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeScalarResolvers = writeScalarResolvers;
exports.capitalize = capitalize;
exports.combiningResolverAndGraphQL = combiningResolverAndGraphQL;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constant_1 = require("./constant");
function writeScalarResolvers(outputDir, useJS, requiredScalars) {
    if (requiredScalars.size === 0) {
        const emptyContent = useJS ? 'module.exports.scalarResolvers = {};' : 'export const scalarResolvers = {};';
        fs_1.default.writeFileSync(path_1.default.join(outputDir, `scalarResolvers${useJS ? '.js' : '.ts'}`), emptyContent);
        return;
    }
    const ext = useJS ? '.js' : '.ts';
    const neededImports = Array.from(requiredScalars).map(s => constant_1.ALL_SCALARS[s]);
    const resolverEntries = Array.from(requiredScalars).map(s => `  ${s}: ${constant_1.ALL_SCALARS[s]},`);
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
    fs_1.default.writeFileSync(path_1.default.join(outputDir, `scalarResolvers${ext}`), content.trim());
}
function combiningResolverAndGraphQL(outputDir, useJS) {
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
    fs_1.default.writeFileSync(path_1.default.join(outputDir, `index${ext}`), content.trim());
}
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
//# sourceMappingURL=utils.js.map
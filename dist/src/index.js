"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGraphQL = generateGraphQL;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pluralize_1 = __importDefault(require("pluralize"));
const requiredScalars = new Set();
function mapType(instance, casterInstance, options) {
    switch (instance) {
        case 'String': return 'String';
        case 'Number': return options?.int || options?.isInt ? 'Int' : 'Float';
        case 'Boolean': return 'Boolean';
        case 'Date':
            requiredScalars.add('Date');
            return 'Date';
        case 'Buffer':
            requiredScalars.add('Base64');
            return 'Base64';
        case 'ObjectID': return 'ID';
        case 'Decimal128':
            requiredScalars.add('Decimal');
            return 'Decimal';
        case 'Long':
            requiredScalars.add('Long');
            return 'Long';
        case 'UUID':
            requiredScalars.add('UUID');
            return 'UUID';
        case 'Mixed':
        case 'Map':
        case 'Object':
            requiredScalars.add('JSON');
            return 'JSON';
        case 'Array':
            const itemType = mapType(casterInstance || 'Mixed');
            return `[${itemType}]`;
        default: return 'String';
    }
}
function writeScalarResolvers(outputDir, useJS) {
    const ext = useJS ? '.js' : '.ts';
    const scalars = useJS
        ? `
const { GraphQLJSON, GraphQLHexadecimal, GraphQLLong, GraphQLDate, GraphQLUUID, GraphQLByte } = require('graphql-scalars');
module.exports.scalarResolvers = {
  JSON: GraphQLJSON,
  Decimal: GraphQLHexadecimal,
  Long: GraphQLLong,
  Date: GraphQLDate,
  UUID: GraphQLUUID,
  Base64: GraphQLByte,
};`
        : `import {
  GraphQLJSON,
  GraphQLHexadecimal,
  GraphQLLong,
  GraphQLDate,
  GraphQLUUID,
  GraphQLByte
} from 'graphql-scalars';

export const scalarResolvers = {
  JSON: GraphQLJSON,
  Decimal: GraphQLHexadecimal,
  Long: GraphQLLong,
  Date: GraphQLDate,
  UUID: GraphQLUUID,
  Base64: GraphQLByte,
};`;
    fs_1.default.writeFileSync(path_1.default.join(outputDir, `scalarResolvers${ext}`), scalars.trim());
}
function combiningResolverAndGraphQL(outputDir, useJS) {
    const ext = useJS ? '.js' : '.ts';
    const scalars = useJS
        ? `
const path = require('path');
const { loadFilesSync } = require('@graphql-tools/load-files');
const { mergeTypeDefs, mergeResolvers } = require('@graphql-tools/merge');
const { scalarResolvers } = require('./scalarResolvers');

const typesArray = loadFilesSync(path.join(__dirname, './**/*.graphql'));
const resolversArray = loadFilesSync(path.join(__dirname, './**/*Resolver.js'));

const typeDefs = mergeTypeDefs(typesArray);
const resolvers = mergeResolvers([scalarResolvers, ...resolversArray]);

module.exports = {
  typeDefs,
  resolvers
};`
        : `
import path from 'path';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { scalarResolvers } from './scalarResolvers';

const typesArray = loadFilesSync(path.join(__dirname, './**/*.graphql'));
const resolversArray = loadFilesSync(path.join(__dirname, './**/*Resolver.ts'));

export const typeDefs = mergeTypeDefs(typesArray);
export const resolvers = mergeResolvers([scalarResolvers, ...resolversArray]);
`;
    fs_1.default.writeFileSync(path_1.default.join(outputDir, `index${ext}`), scalars.trim());
}
async function generateGraphQL(modelFilePath, useJS = false) {
    const absPath = path_1.default.resolve(modelFilePath);
    const model = require(absPath);
    const modelName = model.modelName;
    const schema = model.schema.paths;
    const singular = modelName;
    const plural = (0, pluralize_1.default)(modelName.toLowerCase());
    requiredScalars.clear();
    let gqlFields = '';
    for (const field in schema) {
        if (field === '__v')
            continue;
        const fieldInfo = schema[field];
        const isRequired = !!fieldInfo.isRequired;
        const fieldType = mapType(fieldInfo.instance, fieldInfo.caster?.instance, fieldInfo.options);
        const _fieldType = isRequired ? `${fieldType}!` : `${fieldType}`;
        gqlFields += `  ${field}: ${_fieldType}\n`;
    }
    const gqlType = `type ${singular} {\n${gqlFields}}\n`;
    const gqlInput = `input ${singular}Input {\n${gqlFields}}\n`;
    const scalarDeclarations = `
scalar JSON
scalar Decimal
scalar Long
scalar Date
scalar UUID
scalar Base64
`;
    const gqlPaginationType = `type ${singular}PaginationResult {
  data: [${singular}!]!
  totalCount: Int!
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
}`;
    const gqlSchema = `
${scalarDeclarations}

${gqlType}
${gqlInput}

${gqlPaginationType}

type Query {
  get${singular}(id: ID!): ${singular}
  getAll${plural}(limit: Int, offset: Int): ${singular}PaginationResult
}

type Mutation {
  create${singular}(input: ${singular}Input!): ${singular}
  update${singular}(id: ID!, input: ${singular}Input!): ${singular}
  delete${singular}(id: ID!): Boolean
}`.trim();
    const relPath = path_1.default.relative(path_1.default.join(process.cwd(), 'graphql-codegen', singular.toLowerCase()), absPath).replace(/\\/g, '/');
    const ext = useJS ? '.js' : '.ts';
    const importSyntax = useJS
        ? `const { GraphQLError } = require('graphql');\nconst validator = require('validator');\nconst ${modelName} = require('${relPath}');`
        : `import { GraphQLError } from 'graphql';\nimport validator from 'validator';\nimport ${modelName} from '${relPath}';`;
    const exportSyntax = useJS
        ? `module.exports.resolvers = {
  Query: {`
        : `export const resolvers = {
  Query: {`;
    const resolverCode = `
${importSyntax}

${exportSyntax}
    async get${singular}(_, { id }) {
      if (!validator.isMongoId(id)) {
        throw new GraphQLError("Invalid ID", { extensions: { code: "BAD_USER_INPUT", statusCode: 400 } });
      }
      const doc = await ${modelName}.findById(id);
      if (!doc) throw new GraphQLError("${singular} not found", { extensions: { code: "NOT_FOUND", statusCode: 404 } });
      return doc;
    },
    async getAll${plural}(_, { limit = 10, offset = 0 }) {
      const [data, totalCount] = await Promise.all([
        ${modelName}.find().skip(offset).limit(limit),
        ${modelName}.countDocuments()
      ]);

      return {
        data,
        totalCount,
        hasNextPage: offset + limit < totalCount,
        hasPreviousPage: offset > 0
      };
    },
  },
  Mutation: {
    async create${singular}(_, { input }) {
      try {
        const doc = new ${modelName}(input);
        return await doc.save();
      } catch (err) {
        if (err.code === 11000) throw new GraphQLError("Duplicate entry", { extensions: { code: "DUPLICATE", statusCode: 409 } });
        throw new GraphQLError("Create failed", { extensions: { code: "SERVER_ERROR", error: err.message } });
      }
    },
    async update${singular}(_, { id, input }) {
      const updated = await ${modelName}.findByIdAndUpdate(id, input, { new: true });
      if (!updated) throw new GraphQLError("${singular} not found", { extensions: { code: "NOT_FOUND" } });
      return updated;
    },
    async delete${singular}(_, { id }) {
      const deleted = await ${modelName}.findByIdAndDelete(id);
      if (!deleted) throw new GraphQLError("${singular} not found", { extensions: { code: "NOT_FOUND" } });
      return true;
    },
  },
};`;
    const outDir = path_1.default.join(process.cwd(), 'graphql-codegen', singular.toLowerCase());
    fs_1.default.mkdirSync(outDir, { recursive: true });
    fs_1.default.writeFileSync(path_1.default.join(outDir, `${singular}.graphql`), gqlSchema.trim());
    fs_1.default.writeFileSync(path_1.default.join(outDir, `${singular}Resolver${ext}`), resolverCode.trim());
    const rootOutDir = path_1.default.join(process.cwd(), 'graphql-codegen');
    writeScalarResolvers(rootOutDir, useJS);
    combiningResolverAndGraphQL(rootOutDir, useJS);
    console.log(`✅ Generated GraphQL schema, resolvers, and scalars in graphql-codegen/${singular.toLowerCase()}`);
}

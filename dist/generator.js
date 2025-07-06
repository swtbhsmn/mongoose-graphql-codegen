#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGraphQL = generateGraphQL;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pluralize_1 = __importDefault(require("pluralize"));
// A map of all available scalar types from graphql-scalars and their corresponding imports.
const ALL_SCALARS = {
    JSON: 'GraphQLJSON',
    Decimal: 'GraphQLHexadecimal', // Mongoose Decimal128 is often represented as a hex string
    Long: 'GraphQLLong',
    Date: 'GraphQLDate',
    UUID: 'GraphQLUUID',
    Base64: 'GraphQLByte', // For Buffers
};
function mapType(instance, casterInstance, options) {
    switch (instance) {
        case 'String': return { type: 'String' };
        case 'Number': return { type: options?.int || options?.isInt ? 'Int' : 'Float' };
        case 'Boolean': return { type: 'Boolean' };
        case 'Date': return { type: 'Date', scalar: 'Date' };
        case 'Buffer': return { type: 'Base64', scalar: 'Base64' };
        case 'ObjectID': return { type: 'ID' };
        case 'Decimal128': return { type: 'Decimal', scalar: 'Decimal' };
        case 'Long': return { type: 'Long', scalar: 'Long' };
        case 'UUID': return { type: 'UUID', scalar: 'UUID' };
        case 'Mixed':
        case 'Map':
        case 'Object': return { type: 'JSON', scalar: 'JSON' };
        case 'Array':
            const itemInfo = mapType(casterInstance || 'Mixed');
            return { type: `[${itemInfo.type}]`, scalar: itemInfo.scalar };
        default:
            console.warn(`[GraphQL Generator] Unmapped Mongoose type "${instance}". Defaulting to GraphQL "String".`);
            return { type: 'String' };
    }
}
function writeScalarResolvers(outputDir, useJS, requiredScalars) {
    if (requiredScalars.size === 0) {
        const emptyContent = useJS ? 'module.exports.scalarResolvers = {};' : 'export const scalarResolvers = {};';
        fs_1.default.writeFileSync(path_1.default.join(outputDir, `scalarResolvers${useJS ? '.js' : '.ts'}`), emptyContent);
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
async function generateGraphQL(modelFilePath, useJS = false) {
    try {
        const absPath = path_1.default.resolve(modelFilePath);
        // Use a dynamic import to handle both .js and .ts files from the user
        const modelModule = await Promise.resolve(`${absPath}`).then(s => __importStar(require(s)));
        const model = modelModule.default || modelModule;
        const modelName = model.modelName;
        const schema = model.schema.paths;
        const singular = modelName;
        const plural = (0, pluralize_1.default)(singular);
        const scalarsForThisModel = new Set();
        const nestedTypes = {};
        let gqlFields = '';
        let gqlInputFields = '';
        for (const field in schema) {
            if (field === '__v' || field === '_id')
                continue;
            const fieldInfo = schema[field];
            const { type: fieldType, scalar } = mapType(fieldInfo.instance, fieldInfo.caster?.instance, fieldInfo.options);
            if (scalar) {
                scalarsForThisModel.add(scalar);
            }
            if (field.includes('.')) {
                const [parent, child] = field.split('.');
                const nestedTypeName = capitalize(parent);
                nestedTypes[nestedTypeName] = nestedTypes[nestedTypeName] || {};
                nestedTypes[nestedTypeName][child] = fieldType;
                continue;
            }
            const isRequired = !!fieldInfo.isRequired;
            const finalFieldType = isRequired ? `${fieldType}!` : fieldType;
            gqlFields += `  ${field}: ${finalFieldType}\n`;
            gqlInputFields += `  ${field}: ${finalFieldType}\n`;
        }
        for (const typeName in nestedTypes) {
            const fieldName = typeName.toLowerCase();
            gqlFields += `  ${fieldName}: ${typeName}\n`;
            gqlInputFields += `  ${fieldName}: ${typeName}Input\n`;
        }
        const rootOutDir = path_1.default.join(process.cwd(), 'graphql-codegen');
        const filePathScalar = path_1.default.join(rootOutDir, 'customScalar.json');
        const existingScalars = fs_1.default.existsSync(filePathScalar)
            ? JSON.parse(fs_1.default.readFileSync(filePathScalar, 'utf8'))
            : [];
        const allRequiredScalars = new Set([...existingScalars, ...scalarsForThisModel]);
        fs_1.default.mkdirSync(rootOutDir, { recursive: true });
        fs_1.default.writeFileSync(filePathScalar, JSON.stringify(Array.from(allRequiredScalars), null, 2));
        const scalarDeclarations = Array.from(allRequiredScalars).map(s => `scalar ${s}`).join('\n');
        const nestedTypeDefs = Object.entries(nestedTypes).map(([typeName, fields]) => `type ${typeName} {\n${Object.entries(fields).map(([f, t]) => `  ${f}: ${t}`).join('\n')}\n}`).join('\n\n');
        const nestedInputTypeDefs = Object.entries(nestedTypes).map(([typeName, fields]) => `input ${typeName}Input {\n${Object.entries(fields).map(([f, t]) => `  ${f}: ${t}`).join('\n')}\n}`).join('\n\n');
        const gqlType = `type ${singular} {\n  _id: ID!\n${gqlFields}}`;
        const gqlInput = `input ${singular}Input {\n${gqlInputFields}}`;
        const gqlPaginationType = `type ${singular}PaginationResult {\n  data: [${singular}!]!\n  totalCount: Int!\n  hasNextPage: Boolean!\n  hasPreviousPage: Boolean!\n}`;
        const gqlSchema = `
${scalarDeclarations}
${nestedTypeDefs}
${nestedInputTypeDefs}
${gqlType}
${gqlInput}
${gqlPaginationType}

type Query {
  get${singular}(id: ID!): ${singular}
  list${plural}(limit: Int, offset: Int): ${singular}PaginationResult
}

type Mutation {
  create${singular}(input: ${singular}Input!): ${singular}
  update${singular}(id: ID!, input: ${singular}Input!): ${singular}
  delete${singular}(id: ID!): Boolean
}`.trim().replace(/\n\n+/g, '\n\n').replace(/^(\s*\n){2,}/gm, '\n');
        const outDir = path_1.default.join(rootOutDir, singular.toLowerCase());
        const relPath = path_1.default.relative(outDir, absPath).replace(/\\/g, '/');
        const ext = useJS ? '.js' : '.ts';
        const importSyntax = useJS
            ? `const { GraphQLError } = require('graphql');\nconst validator = require('validator');\nconst ${modelName} = require('${relPath}');`
            : `import { GraphQLError } from 'graphql';\nimport validator from 'validator';\nimport ${modelName} from '${relPath}';`;
        let resolverCode = '';
        if (useJS) {
            resolverCode = `
${importSyntax}

module.exports.resolvers = {
  Query: {
    async get${singular}(_, { id }) {
      if (!validator.isMongoId(id)) {
        throw new GraphQLError("Invalid ID format", { extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } });
      }
      const doc = await ${modelName}.findById(id);
      if (!doc) {
        throw new GraphQLError("${singular} not found", { extensions: { code: "NOT_FOUND", http: { status: 404 } } });
      }
      return doc;
    },
    async list${plural}(_, { limit = 10, offset = 0 }) {
      const [data, totalCount] = await Promise.all([
        ${modelName}.find().skip(offset).limit(limit).lean(),
        ${modelName}.countDocuments()
      ]);

      return { data, totalCount, hasNextPage: offset + limit < totalCount, hasPreviousPage: offset > 0 };
    },
  },
  Mutation: {
    async create${singular}(_, { input }) {
      try {
        const doc = new ${modelName}(input);
        await doc.save();
        return doc;
      } catch (err) {
        if (err.code === 11000) {
          throw new GraphQLError("A document with the given values already exists.", { extensions: { code: "CONFLICT", http: { status: 409 } } });
        }
        throw new GraphQLError(err.message, { extensions: { code: "BAD_REQUEST", http: { status: 400 } } });
      }
    },
    async update${singular}(_, { id, input }) {
      if (!validator.isMongoId(id)) {
        throw new GraphQLError("Invalid ID format", { extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } });
      }
      const updated = await ${modelName}.findByIdAndUpdate(id, input, { new: true });
      if (!updated) {
        throw new GraphQLError("${singular} not found", { extensions: { code: "NOT_FOUND", http: { status: 404 } } });
      }
      return updated;
    },
    async delete${singular}(_, { id }) {
      if (!validator.isMongoId(id)) {
        throw new GraphQLError("Invalid ID format", { extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } });
      }
      const deleted = await ${modelName}.findByIdAndDelete(id);
      if (!deleted) {
        throw new GraphQLError("${singular} not found", { extensions: { code: "NOT_FOUND", http: { status: 404 } } });
      }
      return true;
    },
  },
};`.trim();
        }
        else {
            resolverCode = `
${importSyntax}
import { Document } from 'mongoose';

// Define a type for the input to match the model schema, excluding mongoose-specific fields
interface I${singular} extends Document {
  // Add your model's fields here for better type safety, for example:
  // name: string;
  // email: string;
}

export const resolvers = {
  Query: {
    async get${singular}(_: unknown, { id }: { id: string }): Promise<I${singular}> {
      if (!validator.isMongoId(id)) {
        throw new GraphQLError("Invalid ID format", { extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } });
      }
      const doc = await ${modelName}.findById(id);
      if (!doc) {
        throw new GraphQLError("${singular} not found", { extensions: { code: "NOT_FOUND", http: { status: 404 } } });
      }
      return doc;
    },
    async list${plural}(_: unknown, { limit = 10, offset = 0 }: { limit?: number; offset?: number }) {
      const [data, totalCount] = await Promise.all([
        ${modelName}.find().skip(offset).limit(limit).lean(),
        ${modelName}.countDocuments()
      ]);

      return { data, totalCount, hasNextPage: offset + limit < totalCount, hasPreviousPage: offset > 0 };
    },
  },
  Mutation: {
    async create${singular}(_: unknown, { input }: { input: Omit<I${singular}, '_id'> }): Promise<I${singular}> {
      try {
        const doc = new ${modelName}(input);
        await doc.save();
        return doc;
      } catch (err: any) {
        if (err.code === 11000) {
          throw new GraphQLError("A document with the given values already exists.", { extensions: { code: "CONFLICT", http: { status: 409 } } });
        }
        throw new GraphQLError(err.message, { extensions: { code: "BAD_REQUEST", http: { status: 400 } } });
      }
    },
    async update${singular}(_: unknown, { id, input }: { id: string; input: Partial<Omit<I${singular}, '_id'>> }): Promise<I${singular}> {
      if (!validator.isMongoId(id)) {
        throw new GraphQLError("Invalid ID format", { extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } });
      }
      const updated = await ${modelName}.findByIdAndUpdate(id, input, { new: true });
      if (!updated) {
        throw new GraphQLError("${singular} not found", { extensions: { code: "NOT_FOUND", http: { status: 404 } } });
      }
      return updated;
    },
    async delete${singular}(_: unknown, { id }: { id: string }): Promise<boolean> {
      if (!validator.isMongoId(id)) {
        throw new GraphQLError("Invalid ID format", { extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } });
      }
      const deleted = await ${modelName}.findByIdAndDelete(id);
      if (!deleted) {
        throw new GraphQLError("${singular} not found", { extensions: { code: "NOT_FOUND", http: { status: 404 } } });
      }
      return true;
    },
  },
};`.trim();
        }
        fs_1.default.mkdirSync(outDir, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(outDir, `${singular}.graphql`), gqlSchema);
        fs_1.default.writeFileSync(path_1.default.join(outDir, `${singular}Resolver${ext}`), resolverCode);
        writeScalarResolvers(rootOutDir, useJS, allRequiredScalars);
        combiningResolverAndGraphQL(rootOutDir, useJS);
        console.log(`✅ Generated GraphQL schema and resolvers in graphql-codegen/${singular.toLowerCase()}`);
    }
    catch (error) {
        console.error(`❌ Failed to generate GraphQL files for ${modelFilePath}.`);
        console.error(error);
        process.exit(1);
    }
}
//# sourceMappingURL=generator.js.map
import fs from 'fs';
import path from 'path';
import pluralize from 'pluralize';
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
/**
 * Writes the scalar resolvers file based on a given set of required scalars.
 * This function does not read or write the central scalar list; it only generates the resolver code.
 */
function writeScalarResolvers(outputDir, useJS, requiredScalars) {
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
    fs.writeFileSync(path.join(outputDir, `index${ext}`), content.trim());
}
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
export async function generateGraphQL(modelFilePath, useJS = false) {
    try {
        // ... all existing code from the function
        const absPath = path.resolve(modelFilePath);
        const modelModule = await import(absPath);
        const model = modelModule.default || modelModule;
        const modelName = model.modelName;
        const schema = model.schema.paths;
        const singular = modelName;
        const plural = pluralize(singular);
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
        // Handle nested types by adding fields to the root type and input
        for (const typeName in nestedTypes) {
            const fieldName = typeName.toLowerCase();
            gqlFields += `  ${fieldName}: ${typeName}\n`;
            gqlInputFields += `  ${fieldName}: ${typeName}Input\n`;
        }
        // --- Centralized Scalar Management ---
        const rootOutDir = path.join(process.cwd(), 'graphql-codegen');
        const filePathScalar = path.join(rootOutDir, 'customScalar.json');
        // 1. Read existing scalars from the central JSON file.
        const existingScalars = fs.existsSync(filePathScalar)
            ? JSON.parse(fs.readFileSync(filePathScalar, 'utf8'))
            : [];
        // 2. Merge existing scalars with scalars required by the current model.
        const allRequiredScalars = new Set([...existingScalars, ...scalarsForThisModel]);
        // 3. Write the complete, merged list back to the JSON file for future runs.
        fs.mkdirSync(rootOutDir, { recursive: true });
        fs.writeFileSync(filePathScalar, JSON.stringify(Array.from(allRequiredScalars), null, 2));
        // --- GQL Schema Generation ---
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
        // --- Resolver Generation ---
        const outDir = path.join(rootOutDir, singular.toLowerCase());
        const relPath = path.relative(outDir, absPath).replace(/\\/g, '/');
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

export const resolvers = {
  Query: {
    async get${singular}(_: unknown, { id }: { id: string }) {
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
    async create${singular}(_: unknown, { input }: { input: Omit<any, '_id'> }) {
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
    async update${singular}(_: unknown, { id, input }: { id: string; input: Partial<Omit<any, '_id'>> }) {
      if (!validator.isMongoId(id)) {
        throw new GraphQLError("Invalid ID format", { extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } });
      }
      const updated = await ${modelName}.findByIdAndUpdate(id, input, { new: true });
      if (!updated) {
        throw new GraphQLError("${singular} not found", { extensions: { code: "NOT_FOUND", http: { status: 404 } } });
      }
      return updated;
    },
    async delete${singular}(_: unknown, { id }: { id: string }) {
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
        // --- File Writing ---
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, `${singular}.graphql`), gqlSchema);
        fs.writeFileSync(path.join(outDir, `${singular}Resolver${ext}`), resolverCode);
        // Pass the complete, merged set of scalars to the helper functions
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

#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import pluralize from 'pluralize';
import { ALL_SCALARS } from './constant';
import { mapType } from './mapDataType';
import { writeScalarResolvers ,combiningResolverAndGraphQL,capitalize} from './utils';
require('esbuild-register/dist/node').register();
// A map of all available scalar types from graphql-scalars and their corresponding imports.

export async function generateGraphQL(modelFilePath: string, useJS: boolean = false,externalOutputPath:string=""): Promise<void> {
    try {
        const absPath = path.resolve(modelFilePath);
        // Use a dynamic import to handle both .js and .ts files from the user
        const modelModule = await import(absPath);
        const model = modelModule.default || modelModule;

        const modelName = model.modelName;
        const schema = model.schema.paths;
        const singular = modelName;
        const plural = pluralize(singular);

        const scalarsForThisModel = new Set<keyof typeof ALL_SCALARS>();
        const nestedTypes: Record<string, Record<string, string>> = {};

        let gqlFields = '';
        let gqlInputFields = '';

        for (const field in schema) {
            if (field === '__v' || field === '_id') continue;

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

        const rootOutDir = !externalOutputPath ?  path.join(process.cwd(), 'graphql-codegen') : path.join(externalOutputPath, 'graphql-codegen')
        const filePathScalar = path.join(rootOutDir, 'customScalar.json');

        const existingScalars: (keyof typeof ALL_SCALARS)[] = fs.existsSync(filePathScalar)
            ? JSON.parse(fs.readFileSync(filePathScalar, 'utf8'))
            : [];

        const allRequiredScalars = new Set([...existingScalars, ...scalarsForThisModel]);

        fs.mkdirSync(rootOutDir, { recursive: true });
        fs.writeFileSync(filePathScalar, JSON.stringify(Array.from(allRequiredScalars), null, 2));


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
        } else {
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

        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, `${singular}.graphql`), gqlSchema);
        fs.writeFileSync(path.join(outDir, `${singular}Resolver${ext}`), resolverCode);

        writeScalarResolvers(rootOutDir, useJS, allRequiredScalars);
        combiningResolverAndGraphQL(rootOutDir, useJS);

        console.log(`✅ Generated GraphQL schema and resolvers in graphql-codegen/${singular.toLowerCase()}`);

    } catch (error) {
        console.error(`❌ Failed to generate GraphQL files for ${modelFilePath}.`);
        console.error(error);
        process.exit(1);
    }
}
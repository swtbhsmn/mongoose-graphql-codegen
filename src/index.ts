// mongoose-graphql-codegen/src/index.ts

import fs from 'fs';
import path from 'path';
import pluralize from 'pluralize';

function mapType(instance: string, casterInstance?: string, options?: any): string {
  switch (instance) {
    case 'String': return 'String';
    case 'Number': return options?.int || options?.isInt ? 'Int' : 'Float';
    case 'Boolean': return 'Boolean';
    case 'Date': return 'Date';
    case 'Buffer': return 'Base64';
    case 'ObjectID': return 'ID';
    case 'Decimal128': return 'Decimal';
    case 'Long': return 'Long';
    case 'UUID': return 'UUID';
    case 'Mixed':
    case 'Map':
    case 'Object': return 'JSON';
    case 'Array':
      const itemType = mapType(casterInstance || 'Mixed');
      return `[${itemType}]`;
    default: return 'String';
  }
}

function writeScalarResolvers(outputDir: string, useJS: boolean) {
  const ext = useJS ? '.js' : '.ts';
  const scalars = useJS
    ? `const { GraphQLJSON, GraphQLDecimal, GraphQLLong, GraphQLDate, GraphQLUUID, GraphQLByte } = require('graphql-scalars');

module.exports.scalarResolvers = {
  JSON: GraphQLJSON,
  Decimal: GraphQLDecimal,
  Long: GraphQLLong,
  Date: GraphQLDate,
  UUID: GraphQLUUID,
  Base64: GraphQLByte,
};`
    : `import {
  GraphQLJSON,
  GraphQLDecimal,
  GraphQLLong,
  GraphQLDate,
  GraphQLUUID,
  GraphQLByte
} from 'graphql-scalars';

export const scalarResolvers = {
  JSON: GraphQLJSON,
  Decimal: GraphQLDecimal,
  Long: GraphQLLong,
  Date: GraphQLDate,
  UUID: GraphQLUUID,
  Base64: GraphQLByte,
};`;

  fs.writeFileSync(path.join(outputDir, `scalarResolvers${ext}`), scalars.trim());
}

export async function generateGraphQL(modelFilePath: string, useJS: boolean = false): Promise<void> {
  const absPath = path.resolve(modelFilePath);
  const model = require(absPath);
  const modelName = model.modelName;
  const schema = model.schema.paths;

  const singular = modelName;
  const plural = pluralize(modelName.toLowerCase());

  let gqlFields = '';
  for (const field in schema) {
    if (field === '__v') continue;
    const fieldType = mapType(schema[field].instance, schema[field].caster?.instance, schema[field].options);
    gqlFields += `  ${field}: ${fieldType}\n`;
  }

  const customScalars = [
    'scalar JSON',
    'scalar Decimal',
    'scalar Long',
    'scalar Date',
    'scalar UUID',
    'scalar Base64'
  ];

  const gqlType = `type ${singular} {\n${gqlFields}}\n`;
  const gqlInput = `input ${singular}Input {\n${gqlFields}}\n`;

  const gqlSchema = `
${customScalars.join('\n')}

${gqlType}
${gqlInput}

type Query {
  get${singular}(id: ID!): ${singular}
  getAll${plural}: [${singular}]
}

type Mutation {
  create${singular}(input: ${singular}Input!): ${singular}
  update${singular}(id: ID!, input: ${singular}Input!): ${singular}
  delete${singular}(id: ID!): Boolean
}`;

  const relPath = path.relative(
    path.join(process.cwd(), 'graphql-codegen', singular.toLowerCase()),
    absPath
  ).replace(/\\/g, '/');

  const ext = useJS ? '.js' : '.ts';
  const importSyntax = useJS
    ? `const { GraphQLError } = require('graphql');\nconst validator = require('validator');\nconst ${modelName} = require('${relPath}');`
    : `import { GraphQLError } from 'graphql';\nimport validator from 'validator';\nimport ${modelName} from '${relPath}';`;

  const exportSyntax = useJS
    ? `module.exports.resolvers = {
  Query: {` : `export const resolvers = {
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
    async getAll${plural}() {
      return await ${modelName}.find();
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

  const outDir = path.join(process.cwd(), 'graphql-codegen', singular.toLowerCase());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${singular}.graphql`), gqlSchema.trim());
  fs.writeFileSync(path.join(outDir, `${singular}Resolver${ext}`), resolverCode.trim());

  const rootOutDir = path.join(process.cwd(), 'graphql-codegen');
  writeScalarResolvers(rootOutDir, useJS);

  console.log(`✅ Generated GraphQL schema, resolvers, and scalars in graphql-codegen/${singular.toLowerCase()}`);
}

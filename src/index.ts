import fs from 'fs';
import path from 'path';
import pluralize from 'pluralize';

const requiredScalars = new Set<string>();

function mapType(instance: string, casterInstance?: string, options?: any): string {
  switch (instance) {
    case 'String': return 'String';
    case 'Number':
      const type = options?.int || options?.isInt ? 'Int' : 'Float';
      return type;
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
    default:
      return 'String';
  }
}

function writeScalarResolvers(outputDir: string, useJS: boolean) {
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


  fs.writeFileSync(path.join(outputDir, `scalarResolvers${ext}`), scalars.trim());
}

function combiningResolverAndGraphQL(outputDir: string, useJS: boolean){
  const ext = useJS ? '.js' : '.ts';
  const scalars = !useJS ? `
// graphql-codegen/index.ts

import path from 'path';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';

const typesArray = loadFilesSync(path.join(__dirname, './**/*.graphql'));
const resolversArray = loadFilesSync(path.join(__dirname, './**/*Resolver.ts'));
import { scalarResolvers } from './scalarResolvers';

export const typeDefs = mergeTypeDefs(typesArray);
export const resolvers = mergeResolvers([scalarResolvers, ...resolversArray]);
  ` 
:

`
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
};
`
fs.writeFileSync(path.join(outputDir, `index${ext}`), scalars.trim());
}

export async function generateGraphQL(modelFilePath: string, useJS: boolean = false): Promise<void> {
  const absPath = path.resolve(modelFilePath);
  const model = require(absPath);
  const modelName = model.modelName;
  const schema = model.schema.paths;

  const singular = modelName;
  const plural = pluralize(modelName.toLowerCase());

  requiredScalars.clear();

  let gqlFields = '';
  for (const field in schema) {
    if (field === '__v') continue;
    const fieldType = mapType(schema[field].instance, schema[field].caster?.instance, schema[field].options);
    gqlFields += `  ${field}: ${fieldType}\n`;
  }

  const gqlType = `type ${singular} {\n${gqlFields}}\n`;
  const gqlInput = `input ${singular}Input {\n${gqlFields}}\n`;
  
//Array.from(requiredScalars).map(s => `scalar ${s}`).join('\n');
  const scalarDeclarations = `
scalar JSON
scalar Decimal
scalar Long
scalar Date
scalar UUID
scalar Base64
  `

  const gqlSchema = `
${scalarDeclarations}

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
}`.trim();

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
  combiningResolverAndGraphQL(rootOutDir, useJS)

  console.log(`✅ Generated GraphQL schema, resolvers, and scalars in graphql-codegen/${singular.toLowerCase()}`);
}

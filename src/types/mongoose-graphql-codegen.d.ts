// src/types/mongoose-graphql-codegen.d.ts
declare module 'mongoose-graphql-codegen' {
  export function generateGraphQL(modelFilePath: string, useJS?: boolean): Promise<void>;
}
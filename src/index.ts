#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import { generateGraphQL } from './generator';

function main(){

const args = process.argv.slice(2);
const argMap: Record<string, string> = {};

args.forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value !== undefined) {
    argMap[key] = value;
  }
});

const modelPath = argMap['model'];
const useJS = argMap['js'] === 'true';
const outDir = path.join(process.cwd(), 'models');
const externalOutputPath = argMap['outDir']
const files: string[] = []
if (!modelPath) {
  if (fs.existsSync(outDir)) {
    const _files = fs.readdirSync(outDir)
    if (_files.length > 0) {
      _files.forEach((file) => {
        files.push(file)
      })
    }
    else {
      console.error('❌ Files not found in models dir!.');
      process.exit(1);
    }
  }
  else {
    console.error('❌ Please provide model=<path to Mongoose model file>.');
    process.exit(1);
  }

}

modelPath ? (
  generateGraphQL(path.resolve(modelPath), useJS,externalOutputPath)
    .catch((err) => {
      console.error('❌ Generation failed:', err.message);
      process.exit(1);
    })) :
  (
    Promise.all(
        files.map((file) => 
        generateGraphQL(outDir + "/" + file, useJS,externalOutputPath)
        .catch((err) => {
          console.error('❌ Generation failed:', err.message);
          process.exit(1);
        })
    )
    )
  )

}
if (require.main === module) {
  main();
}
export {generateGraphQL}
export default main;
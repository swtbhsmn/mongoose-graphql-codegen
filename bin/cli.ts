#!/usr/bin/env node

import path from 'path';
import { generateGraphQL } from '../src/index';

const args = process.argv.slice(2);
const modelPath = args[0];
const useJS = args.includes('--js');
console.log(args)
if (!modelPath) {
  console.error('❌ Please provide a path to the Mongoose model file.');
  process.exit(1);
}

generateGraphQL(path.resolve(modelPath), useJS)
  .catch((err) => {
    console.error('❌ Generation failed:', err.message);
    process.exit(1);
});

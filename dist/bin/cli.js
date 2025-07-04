#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const index_1 = require("../src/index");
const args = process.argv.slice(2);
const modelPath = args[0];
const useJS = args.includes('--js');
console.log(args);
if (!modelPath) {
    console.error('❌ Please provide a path to the Mongoose model file.');
    process.exit(1);
}
(0, index_1.generateGraphQL)(path_1.default.resolve(modelPath), useJS)
    .catch((err) => {
    console.error('❌ Generation failed:', err.message);
    process.exit(1);
});

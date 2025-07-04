#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const index_1 = require("../src/index");
const args = process.argv.slice(2);
const argMap = {};
args.forEach(arg => {
    const [key, value] = arg.split('=');
    if (key && value !== undefined) {
        argMap[key] = value;
    }
});
const modelPath = argMap['model'];
const useJS = argMap['js'] === 'true';
const outDir = path_1.default.join(process.cwd(), 'models');
const files = [];
if (!modelPath) {
    if (fs_1.default.existsSync(outDir)) {
        const _files = fs_1.default.readdirSync(outDir);
        if (_files.length > 0) {
            _files.forEach((file) => {
                files.push(file);
            });
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
modelPath ? ((0, index_1.generateGraphQL)(path_1.default.resolve(modelPath), useJS)
    .catch((err) => {
    console.error('❌ Generation failed:', err.message);
    process.exit(1);
})) :
    (files.map((file) => {
        (0, index_1.generateGraphQL)(outDir + "/" + file, useJS)
            .catch((err) => {
            console.error('❌ Generation failed:', err.message);
            process.exit(1);
        });
    }));

#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGraphQL = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const generator_1 = require("./generator");
Object.defineProperty(exports, "generateGraphQL", { enumerable: true, get: function () { return generator_1.generateGraphQL; } });
function main() {
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
    const externalOutputPath = argMap['outDir'];
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
    modelPath ? ((0, generator_1.generateGraphQL)(path_1.default.resolve(modelPath), useJS, externalOutputPath)
        .catch((err) => {
        console.error('❌ Generation failed:', err.message);
        process.exit(1);
    })) :
        (Promise.all(files.map((file) => (0, generator_1.generateGraphQL)(outDir + "/" + file, useJS, externalOutputPath)
            .catch((err) => {
            console.error('❌ Generation failed:', err.message);
            process.exit(1);
        }))));
}
if (require.main === module) {
    main();
}
exports.default = main;
//# sourceMappingURL=index.js.map
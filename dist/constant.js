"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_SCALARS = void 0;
const ALL_SCALARS = {
    JSON: 'GraphQLJSON',
    Decimal: 'GraphQLHexadecimal', // Mongoose Decimal128 is often represented as a hex string
    Long: 'GraphQLLong',
    Date: 'GraphQLDate',
    UUID: 'GraphQLUUID',
    Base64: 'GraphQLByte', // For Buffers
};
exports.ALL_SCALARS = ALL_SCALARS;
//# sourceMappingURL=constant.js.map
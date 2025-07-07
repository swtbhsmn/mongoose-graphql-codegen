import { ALL_SCALARS } from './constant';
type MappedTypeResult = {
    type: string;
    scalar?: keyof typeof ALL_SCALARS;
};

function mapType(instance: string, casterInstance?: string, options?: any): MappedTypeResult {
    switch (instance) {
        case 'String': return { type: 'String' };
        case 'Number': return { type: options?.int || options?.isInt ? 'Int' : 'Float' };
        case 'Boolean': return { type: 'Boolean' };
        case 'Date': return { type: 'Date', scalar: 'Date' };
        case 'Buffer': return { type: 'Base64', scalar: 'Base64' };
        case 'ObjectID': return { type: 'ID' };
        case 'Decimal128': return { type: 'Decimal', scalar: 'Decimal' };
        case 'Long': return { type: 'Long', scalar: 'Long' };
        case 'UUID': return { type: 'UUID', scalar: 'UUID' };
        case 'Mixed':
        case 'Map':
        case 'Object': return { type: 'JSON', scalar: 'JSON' };
        case 'Array':
            const itemInfo = mapType(casterInstance || 'Mixed');
            return { type: `[${itemInfo.type}]`, scalar: itemInfo.scalar };
        default:
            console.warn(`[GraphQL Generator] Unmapped Mongoose type "${instance}". Defaulting to GraphQL "String".`);
            return { type: 'String' };
    }
}

export {mapType}
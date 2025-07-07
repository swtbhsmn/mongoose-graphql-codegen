import { ALL_SCALARS } from './constant';
type MappedTypeResult = {
    type: string;
    scalar?: keyof typeof ALL_SCALARS;
};
declare function mapType(instance: string, casterInstance?: string, options?: any): MappedTypeResult;
export { mapType };

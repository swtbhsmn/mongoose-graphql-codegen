import { ALL_SCALARS } from "./constant";
declare function writeScalarResolvers(outputDir: string, useJS: boolean, requiredScalars: Set<keyof typeof ALL_SCALARS>): void;
declare function combiningResolverAndGraphQL(outputDir: string, useJS: boolean): void;
declare function capitalize(str: string): string;
export { writeScalarResolvers, capitalize, combiningResolverAndGraphQL };

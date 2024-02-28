import type { InitialOptionsTsJest } from "ts-jest/dist/types";

const config: InitialOptionsTsJest = {
    moduleFileExtensions: ["ts", "js"],
    preset: "ts-jest",
    rootDir: "test",
    testMatch: ["**/*.spec.ts"],
    verbose: true,
};
export default config;

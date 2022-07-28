import type { InitialOptionsTsJest } from "ts-jest/dist/types";

const config: InitialOptionsTsJest = {
    globals: {
        "ts-jest": {
            tsconfig: "tsconfig.json",
        },
    },
    moduleFileExtensions: ["ts", "js"],
    preset: "ts-jest",
    rootDir: "test",
    testMatch: ["**/*.spec.ts"],
    verbose: true,
};
export default config;

import { createRequire } from "node:module";
import { createLiveOntology, type OntologyIR } from "@party-stack/ontology";
import { createSQLiteOntologyBackendAdapter } from "@party-stack/sqlite-ontology";
import { describe, expect, it } from "vitest";
import { convertFoundryMetaActionType } from "./convertMetaActionType.js";
import type { ActionParameterV2, ActionTypeFullMetadata } from "@osdk/foundry.ontologies";

interface TestDatabase {
    close: () => void;
    exec: (sql: string) => void;
    prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown[];
        get: (...params: unknown[]) => unknown;
        run: (...params: unknown[]) => unknown;
    };
    transaction: (fn: () => void) => () => void;
}

const require = createRequire(import.meta.url);
const BetterSqlite3 = require("better-sqlite3") as unknown;
const Database = BetterSqlite3 as new (path: string) => TestDatabase;

function metadata(
    apiName: string,
    parameters: Record<string, ActionParameterV2>,
    rule: Record<string, unknown>
): ActionTypeFullMetadata {
    return {
        actionType: {
            apiName,
            displayName: apiName,
            status: "EXPERIMENTAL",
            parameters,
            rid: `ri.actions.main.action-type.${apiName}`,
            operations: [],
        },
        fullLogicRules: [rule as never],
    };
}

function entriesParameter(): ActionParameterV2 {
    return {
        displayName: "Entries",
        dataType: {
            type: "array",
            subType: {
                type: "struct",
                fields: [
                    {
                        name: "code",
                        fieldType: { type: "string" },
                        required: true,
                    },
                    {
                        name: "enabled",
                        fieldType: { type: "boolean" },
                        required: true,
                    },
                ],
            },
        },
        required: false,
        typeClasses: [],
    };
}

const entriesMapping = {
    code: {
        type: "structListParameterFieldValue",
        parameterId: "entries",
        structParameterFieldApiName: "code",
    },
    enabled: {
        type: "structListParameterFieldValue",
        parameterId: "entries",
        structParameterFieldApiName: "enabled",
    },
} as const;

describe("converted Foundry list-of-struct actions with SQLite", () => {
    it("persists complete lists on create and when populating an absent property", async () => {
        const idParameter: ActionParameterV2 = {
            displayName: "ID",
            dataType: { type: "string" },
            required: true,
            typeClasses: [],
        };
        const recordParameter: ActionParameterV2 = {
            displayName: "Record",
            dataType: {
                type: "object",
                objectTypeApiName: "Record",
                objectApiName: "record",
            },
            required: true,
            typeClasses: [],
        };
        const createAction = convertFoundryMetaActionType(
            metadata(
                "create-record",
                {
                    id: idParameter,
                    entries: entriesParameter(),
                },
                {
                    type: "createObject",
                    objectTypeApiName: "Record",
                    propertyArguments: {
                        id: {
                            type: "parameterId",
                            parameterId: "id",
                        },
                    },
                    structPropertyArguments: {
                        entries: entriesMapping,
                    },
                }
            )
        );
        const updateAction = convertFoundryMetaActionType(
            metadata(
                "update-record",
                {
                    record: recordParameter,
                    entries: entriesParameter(),
                },
                {
                    type: "modifyObject",
                    objectToModify: "record",
                    propertyArguments: {},
                    structPropertyArguments: {
                        entries: entriesMapping,
                    },
                }
            )
        );
        const mapAction = convertFoundryMetaActionType(
            metadata(
                "map-record-entries",
                {
                    record: recordParameter,
                    entries: entriesParameter(),
                },
                {
                    type: "modifyObject",
                    objectToModify: "record",
                    propertyArguments: {},
                    structPropertyArguments: {
                        summaries: {
                            identifier: {
                                type: "structListParameterFieldValue",
                                parameterId: "entries",
                                structParameterFieldApiName: "code",
                            },
                        },
                    },
                }
            )
        );
        const ir: OntologyIR = {
            types: [],
            objectTypes: [
                {
                    name: "Record",
                    displayName: "Record",
                    pluralDisplayName: "Records",
                    primaryKey: "id",
                    properties: [
                        {
                            name: "id",
                            displayName: "ID",
                            type: { kind: "string", value: {} },
                        },
                        {
                            name: "entries",
                            displayName: "Entries",
                            type: createAction.parameters.find((parameter) => parameter.name === "entries")!
                                .type,
                        },
                        {
                            name: "summaries",
                            displayName: "Summaries",
                            type: {
                                kind: "optional",
                                value: {
                                    type: {
                                        kind: "list",
                                        value: {
                                            elementType: {
                                                kind: "struct",
                                                value: {
                                                    fields: [
                                                        {
                                                            name: "identifier",
                                                            displayName: "Identifier",
                                                            type: {
                                                                kind: "string",
                                                                value: {},
                                                            },
                                                        },
                                                    ],
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    ],
                },
            ],
            linkTypes: [],
            actionTypes: [createAction, updateAction, mapAction],
            queryFunctionTypes: [],
        };
        const database = new Database(":memory:");
        const ontology = await createLiveOntology({
            ir,
            backend: () =>
                createSQLiteOntologyBackendAdapter({
                    ir,
                    database,
                    name: "list-struct",
                }),
        });

        try {
            await ontology.ready;
            const createEntries = [
                { code: "alpha", enabled: true },
                { code: "beta", enabled: false },
            ];
            await ontology.actions.createRecord!({
                id: "with-list",
                entries: createEntries,
            });
            await ontology.actions.createRecord!({
                id: "initially-absent",
            });
            await ontology.actions.createRecord!({
                id: "mapped-list",
            });
            const readPersisted = (id: string) => {
                const row = database
                    .prepare('SELECT data FROM "party_stack_list_x2d_struct_Record" WHERE id = ?')
                    .get(id) as { data: string };
                return JSON.parse(row.data) as Record<string, unknown>;
            };
            expect(readPersisted("initially-absent")).not.toHaveProperty("entries");

            const updateEntries = [
                { code: "gamma", enabled: false },
                { code: "delta", enabled: true },
            ];
            await ontology.actions.updateRecord!({
                record: "initially-absent",
                entries: updateEntries,
            });
            expect(readPersisted("initially-absent")).toMatchObject({
                id: "initially-absent",
                entries: updateEntries,
            });
            await ontology.actions.mapRecordEntries!({
                record: "mapped-list",
                entries: updateEntries,
            });

            expect(readPersisted("with-list")).toMatchObject({
                id: "with-list",
                entries: createEntries,
            });
            expect(readPersisted("mapped-list")).toMatchObject({
                id: "mapped-list",
                summaries: [{ identifier: "gamma" }, { identifier: "delta" }],
            });
        } finally {
            await ontology.cleanup();
            database.close();
        }
    });
});

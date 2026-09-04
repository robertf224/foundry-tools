import { createCollection, localOnlyCollectionOptions } from "@tanstack/db";
import { describe, expect, it } from "vitest";
import { o } from "../ir/index.js";
import { evaluateExpression } from "./expression.js";
import { createReadTx } from "./mutators/createMutatorTx.js";
import type { Expression, OntologyIR } from "../ir/index.js";
import type { OntologyObject } from "./objects/OntologyObject.js";

const ir: OntologyIR = {
    types: [],
    linkTypes: [],
    queryFunctionTypes: [],
    objectTypes: [
        {
            name: "User",
            displayName: "User",
            pluralDisplayName: "Users",
            primaryKey: "id",
            properties: [
                {
                    name: "id",
                    displayName: "ID",
                    type: o.string({}),
                },
                {
                    name: "name",
                    displayName: "Name",
                    type: o.string({}),
                },
            ],
        },
    ],
    actionTypes: [
        {
            name: "assign",
            displayName: "Assign",
            parameters: [
                {
                    name: "user",
                    displayName: "User",
                    type: o.objectReference({
                        objectType: "User",
                    }),
                },
                {
                    name: "entries",
                    displayName: "Entries",
                    type: o.list({
                        elementType: o.struct({
                            fields: [
                                {
                                    name: "code",
                                    displayName: "Code",
                                    type: o.string({}),
                                },
                            ],
                        }),
                    }),
                },
            ],
            logic: [],
        },
    ],
};

describe("evaluateExpression", () => {
    it("resolves object-reference paths through the read transaction", async () => {
        const users = createCollection(
            localOnlyCollectionOptions<OntologyObject, string | number>({
                id: "expression-users",
                getKey: (user) => user.id as string | number,
                initialData: [
                    {
                        id: "user-1",
                        name: "Ada",
                    },
                ],
            })
        );
        await users.preload();

        await expect(
            evaluateExpression({
                ir,
                actionTypeName: "assign",
                expression: {
                    kind: "valueReference",
                    value: {
                        path: ["user", "name"],
                    },
                } as Expression,
                resolveParameter: () => Promise.resolve("user-1"),
                context: {},
                tx: createReadTx({ User: users }),
            })
        ).resolves.toBe("Ada");

        await users.cleanup();
    });

    it("returns an object-reference primary key without querying its collection", async () => {
        const query = () => {
            throw new Error("The object collection should not be queried.");
        };

        await expect(
            evaluateExpression({
                ir,
                actionTypeName: "assign",
                expression: {
                    kind: "valueReference",
                    value: {
                        path: ["user", "id"],
                    },
                } as Expression,
                resolveParameter: () => Promise.resolve("user-1"),
                context: {},
                tx: { query } as never,
            })
        ).resolves.toBe("user-1");
    });

    it("maps list elements into constructed structs", async () => {
        await expect(
            evaluateExpression({
                ir,
                actionTypeName: "assign",
                expression: o.Expression.map({
                    source: o.Expression.valueReference({
                        path: ["entries"],
                    }),
                    binding: "entry",
                    body: o.Expression.struct({
                        fields: [
                            {
                                name: "renamedCode",
                                value: o.Expression.localReference({
                                    binding: "entry",
                                    path: ["code"],
                                }),
                            },
                            {
                                name: "actor",
                                value: o.Expression.contextReference({
                                    path: ["user"],
                                }),
                            },
                        ],
                    }),
                }),
                resolveParameter: (name) =>
                    Promise.resolve(name === "entries" ? [{ code: "alpha" }, { code: "beta" }] : undefined),
                context: { user: "user-1" },
                tx: createReadTx({}),
            })
        ).resolves.toEqual([
            {
                renamedCode: "alpha",
                actor: "user-1",
            },
            {
                renamedCode: "beta",
                actor: "user-1",
            },
        ]);
    });

    it("preserves an undefined optional map source", async () => {
        await expect(
            evaluateExpression({
                ir,
                actionTypeName: "assign",
                expression: o.Expression.map({
                    source: o.Expression.valueReference({
                        path: ["entries"],
                    }),
                    binding: "entry",
                    body: o.Expression.localReference({
                        binding: "entry",
                        path: [],
                    }),
                }),
                resolveParameter: () => Promise.resolve(undefined),
                context: {},
                tx: createReadTx({}),
            })
        ).resolves.toBeUndefined();
    });
});

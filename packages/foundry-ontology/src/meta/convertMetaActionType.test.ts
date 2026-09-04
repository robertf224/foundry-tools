import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { validate, type OntologyIR } from "@party-stack/ontology";
import { convertFoundryMetaActionType } from "./convertMetaActionType.js";
import type { ActionParameterV2, ActionTypeFullMetadata } from "@osdk/foundry.ontologies";

function actionType(parameters: Record<string, ActionParameterV2>): ActionTypeFullMetadata {
    return {
        actionType: {
            apiName: "validated-action",
            displayName: "Validated action",
            status: "EXPERIMENTAL",
            parameters,
            rid: "ri.actions.main.action-type.example",
            operations: [],
        },
        fullLogicRules: [],
    };
}

function structListParameter(): ActionParameterV2 {
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

function structListField(parameterId: string, field: string): never {
    return {
        type: "structListParameterFieldValue",
        parameterId,
        structParameterFieldApiName: field,
    } as never;
}

function structField(parameterId: string, field: string): never {
    return {
        type: "structParameterFieldValue",
        parameterId,
        structParameterFieldApiName: field,
    } as never;
}

function omsActionMetadata(
    parameterName: string,
    allowedValues: Record<string, unknown>,
    prefill?: Record<string, unknown>
): never {
    return {
        actionTypeLogic: {
            validation: {
                parameterValidations: {
                    [parameterName]: {
                        defaultValidation: {
                            display: {
                                prefill,
                            },
                            validation: {
                                allowedValues,
                            },
                        },
                    },
                },
            },
        },
    } as never;
}

function omsOneOf(
    values: Array<{ label: string; value: string }>,
    allowed = false
): Record<string, unknown> {
    return {
        type: "oneOf",
        oneOf: {
            type: "oneOf",
            oneOf: {
                labelledValues: values.map(({ label, value }) => ({
                    label,
                    value: {
                        type: "string",
                        string: value,
                    },
                })),
                otherValueAllowed: { allowed },
            },
        },
    };
}

function omsTextRegex(regex: string): Record<string, unknown> {
    return {
        type: "text",
        text: {
            type: "text",
            text: {
                regex: {
                    regex,
                    failureMessage: "Invalid value.",
                },
            },
        },
    };
}

describe("convertFoundryMetaActionType parameter validation", () => {
    it("maps the Foundry action type RID to the runtime metadata ID", () => {
        expect(convertFoundryMetaActionType(actionType({}))).toMatchObject({
            id: "ri.actions.main.action-type.example",
            name: "validatedAction",
        });
    });

    it("converts closed one-of string validation to an enum constraint", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                status: {
                    displayName: "Status",
                    dataType: { type: "string" },
                    required: true,
                    typeClasses: [],
                    validation: {
                        defaultValidation: {
                            allowedValues: {
                                type: "oneOf",
                                options: [
                                    { displayName: "Open", value: "open" },
                                    { displayName: "Closed", value: "closed" },
                                ],
                                otherValuesAllowed: false,
                            },
                        },
                    },
                },
            })
        );

        expect(result.parameters[0]?.type).toEqual({
            kind: "string",
            value: {
                constraint: {
                    kind: "enum",
                    value: {
                        options: [
                            { value: "open", label: "Open" },
                            { value: "closed", label: "Closed" },
                        ],
                    },
                },
            },
        });
    });

    it("preserves one-of suggestions that permit other values", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                status: {
                    displayName: "Status",
                    dataType: { type: "string" },
                    required: true,
                    typeClasses: [],
                    validation: {
                        defaultValidation: {
                            allowedValues: {
                                type: "oneOf",
                                options: [{ displayName: "Open", value: "open" }],
                                otherValuesAllowed: true,
                            },
                        },
                    },
                },
            })
        );

        expect(result.parameters[0]?.type).toEqual({
            kind: "string",
            value: {
                suggestions: [
                    {
                        value: "open",
                        label: "Open",
                    },
                ],
            },
        });
    });

    it("converts text regex validation to a regex constraint", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                postalCode: {
                    displayName: "Postal code",
                    dataType: { type: "string" },
                    required: false,
                    typeClasses: [],
                    validation: {
                        defaultValidation: {
                            allowedValues: {
                                type: "text",
                                regex: "^\\d{5}$",
                            },
                        },
                    },
                },
            })
        );

        expect(result.parameters[0]?.type).toEqual({
            kind: "optional",
            value: {
                type: {
                    kind: "string",
                    value: {
                        constraint: {
                            kind: "regex",
                            value: { regex: "^\\d{5}$" },
                        },
                    },
                },
            },
        });
    });

    it("references value types so their existing constraints are reused", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                postalCode: {
                    displayName: "Postal code",
                    dataType: { type: "string" },
                    required: true,
                    typeClasses: [],
                    validation: {
                        defaultValidation: {
                            allowedValues: {
                                type: "valueType",
                                apiName: "PostalCode",
                                rid: "ri.ontology.main.value-type.example",
                                versionId: "1",
                            },
                        },
                    },
                },
            })
        );

        expect(result.parameters[0]?.type).toEqual({
            kind: "ref",
            value: { name: "PostalCode" },
        });
    });

    it("maps Foundry current user arguments to the canonical user context", () => {
        const metadata = actionType({});
        metadata.fullLogicRules = [
            {
                type: "createObject",
                objectTypeApiName: "Task",
                propertyArguments: {
                    createdBy: {
                        type: "currentUser",
                    },
                },
                structPropertyArguments: {},
            } as never,
        ];

        expect(
            convertFoundryMetaActionType(
                metadata
            ).logic
        ).toEqual([
            {
                kind: "createObject",
                value: {
                    objectType: "Task",
                    values: [
                        {
                            property: [
                                "createdBy",
                            ],
                            value: {
                                kind: "contextReference",
                                value: {
                                    path: [
                                        "user",
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
        ]);
    });
});

describe("convertFoundryMetaActionType struct assignments", () => {
    it.each([
        {
            name: "create-object",
            rule: {
                type: "createObject",
                objectTypeApiName: "Record",
                propertyArguments: {},
                structPropertyArguments: {
                    entries: {
                        code: structListField("entries", "code"),
                        enabled: structListField("entries", "enabled"),
                    },
                },
            },
            expectedKind: "createObject",
        },
        {
            name: "update-object",
            rule: {
                type: "modifyObject",
                objectToModify: "record",
                propertyArguments: {},
                structPropertyArguments: {
                    entries: {
                        code: structListField("entries", "code"),
                        enabled: structListField("entries", "enabled"),
                    },
                },
            },
            expectedKind: "updateObject",
        },
    ])("converts a complete $name list mapping to one whole-list assignment", ({
        rule,
        expectedKind,
    }) => {
        const metadata = actionType({
            entries: structListParameter(),
            record: {
                displayName: "Record",
                dataType: {
                    type: "object",
                    objectTypeApiName: "Record",
                    objectApiName: "record",
                },
                required: true,
                typeClasses: [],
            },
        });
        metadata.fullLogicRules = [rule as never];

        expect(convertFoundryMetaActionType(metadata).logic).toMatchObject([
            {
                kind: expectedKind,
                value: {
                    values: [
                        {
                            property: ["entries"],
                            value: {
                                kind: "valueReference",
                                value: { path: ["entries"] },
                            },
                        },
                    ],
                },
            },
        ]);
    });

    it("preserves nested assignments for an ordinary struct", () => {
        const metadata = actionType({
            details: {
                displayName: "Details",
                dataType: {
                    type: "struct",
                    fields: [
                        {
                            name: "code",
                            fieldType: { type: "string" },
                            required: true,
                        },
                    ],
                },
                required: true,
                typeClasses: [],
            },
        });
        metadata.fullLogicRules = [
            {
                type: "createObject",
                objectTypeApiName: "Record",
                propertyArguments: {},
                structPropertyArguments: {
                    details: {
                        code: structField("details", "code"),
                    },
                },
            } as never,
        ];

        expect(convertFoundryMetaActionType(metadata).logic).toMatchObject([
            {
                value: {
                    values: [
                        {
                            property: ["details", "code"],
                            value: {
                                kind: "valueReference",
                                value: { path: ["details", "code"] },
                            },
                        },
                    ],
                },
            },
        ]);
    });

    it.each([
        {
            name: "partial",
            fields: {
                code: structListField("entries", "code"),
            },
            message: "mapping does not include every field",
        },
        {
            name: "renamed",
            fields: {
                renamedCode: structListField("entries", "code"),
                enabled: structListField("entries", "enabled"),
            },
            message: 'target field "renamedCode" is mapped from source field "code"',
        },
        {
            name: "per-element mapping across parameters",
            fields: {
                code: structListField("entries", "code"),
                enabled: structListField("otherEntries", "enabled"),
            },
            message: "fields are mapped from multiple list parameters",
        },
    ])("rejects unsupported $name semantics", ({ fields, message }) => {
        const metadata = actionType({
            entries: structListParameter(),
            otherEntries: structListParameter(),
        });
        metadata.fullLogicRules = [
            {
                type: "createObject",
                objectTypeApiName: "Record",
                propertyArguments: {},
                structPropertyArguments: { entries: fields },
            } as never,
        ];

        expect(() => convertFoundryMetaActionType(metadata)).toThrow(
            `Unsupported Foundry list-of-struct assignment for property "entries": ${message}`
        );
    });

    it("produces action IR that passes ontology validation", () => {
        const metadata = actionType({
            entries: structListParameter(),
            record: {
                displayName: "Record",
                dataType: {
                    type: "object",
                    objectTypeApiName: "Record",
                    objectApiName: "record",
                },
                required: true,
                typeClasses: [],
            },
        });
        metadata.fullLogicRules = [
            {
                type: "createObject",
                objectTypeApiName: "Record",
                propertyArguments: {},
                structPropertyArguments: {
                    entries: {
                        code: structListField("entries", "code"),
                        enabled: structListField("entries", "enabled"),
                    },
                },
            },
            {
                type: "modifyObject",
                objectToModify: "record",
                propertyArguments: {},
                structPropertyArguments: {
                    entries: {
                        code: structListField("entries", "code"),
                        enabled: structListField("entries", "enabled"),
                    },
                },
            },
        ] as never;
        const converted = convertFoundryMetaActionType(metadata);
        const ontology: OntologyIR = {
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
                            type: converted.parameters[0]!.type,
                        },
                    ],
                },
            ],
            linkTypes: [],
            actionTypes: [converted],
            queryFunctionTypes: [],
        };

        expect(validate(ontology)).toEqual({ kind: "ok" });
    });
});

describe("convertFoundryMetaActionType OMS string constraints", () => {
    it("uses a closed OMS one-of and preserves its prefill", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                country: {
                    displayName: "Country",
                    dataType: { type: "string" },
                    required: true,
                    typeClasses: [],
                },
            }),
            omsActionMetadata(
                "country",
                omsOneOf([
                    { label: "United States", value: "US" },
                    { label: "Canada", value: "CA" },
                ]),
                {
                    type: "staticValue",
                    staticValue: {
                        type: "string",
                        string: "US",
                    },
                }
            )
        );

        expect(result.parameters[0]?.type).toEqual({
            kind: "string",
            value: {
                constraint: {
                    kind: "enum",
                    value: {
                        options: [
                            { value: "US", label: "United States" },
                            { value: "CA", label: "Canada" },
                        ],
                    },
                },
            },
        });
        expect(result.parameters[0]?.defaultValue).toEqual({
            kind: "literal",
            value: { value: "US" },
        });
    });

    it("preserves open OMS one-of values as optional string suggestions", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                country: {
                    displayName: "Country",
                    dataType: { type: "string" },
                    required: false,
                    typeClasses: [],
                },
                claim: {
                    displayName: "Claim",
                    dataType: {
                        type: "object",
                        objectTypeApiName: "Claim",
                        objectApiName: "claim",
                    },
                    required: true,
                    typeClasses: [],
                },
            }),
            omsActionMetadata(
                "country",
                omsOneOf(
                    [
                        { label: "United States", value: "US" },
                        { label: "Mexico", value: "MX" },
                        { label: "Canada", value: "CA" },
                    ],
                    true
                ),
                {
                    type: "objectParameterPropertyValue",
                    objectParameterPropertyValue: {
                        parameterId: "claim",
                        propertyTypeId: "country",
                    },
                }
            )
        );

        expect(result.parameters[0]?.type).toEqual({
            kind: "optional",
            value: {
                type: {
                    kind: "string",
                    value: {
                        suggestions: [
                            {
                                value: "US",
                                label: "United States",
                            },
                            {
                                value: "MX",
                                label: "Mexico",
                            },
                            {
                                value: "CA",
                                label: "Canada",
                            },
                        ],
                    },
                },
            },
        });
        expect(result.parameters[0]?.defaultValue).toEqual({
            kind: "valueReference",
            value: {
                path: ["claim", "country"],
            },
        });
    });

    it("applies an OMS enum inside optional strings", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                country: {
                    displayName: "Country",
                    dataType: { type: "string" },
                    required: false,
                    typeClasses: [],
                },
            }),
            omsActionMetadata(
                "country",
                omsOneOf([{ label: "United States", value: "US" }])
            )
        );

        expect(result.parameters[0]?.type).toEqual({
            kind: "optional",
            value: {
                type: {
                    kind: "string",
                    value: {
                        constraint: {
                            kind: "enum",
                            value: {
                                options: [
                                    {
                                        value: "US",
                                        label: "United States",
                                    },
                                ],
                            },
                        },
                    },
                },
            },
        });
    });

    it("applies OMS constraints to string list element types", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                countries: {
                    displayName: "Countries",
                    dataType: {
                        type: "array",
                        subType: { type: "string" },
                    },
                    required: true,
                    typeClasses: [],
                },
            }),
            omsActionMetadata(
                "countries",
                omsOneOf([{ label: "United States", value: "US" }])
            )
        );

        expect(result.parameters[0]?.type).toMatchObject({
            kind: "list",
            value: {
                elementType: {
                    kind: "string",
                    value: {
                        constraint: {
                            kind: "enum",
                        },
                    },
                },
            },
        });
    });

    it("uses an OMS text regex when public metadata has none", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                postalCode: {
                    displayName: "Postal code",
                    dataType: { type: "string" },
                    required: true,
                    typeClasses: [],
                },
            }),
            omsActionMetadata(
                "postalCode",
                omsTextRegex("^\\d{5}$")
            )
        );

        expect(result.parameters[0]?.type).toEqual({
            kind: "string",
            value: {
                constraint: {
                    kind: "regex",
                    value: { regex: "^\\d{5}$" },
                },
            },
        });
    });

    it("keeps public string constraints when OMS also supplies one", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                country: {
                    displayName: "Country",
                    dataType: { type: "string" },
                    required: true,
                    typeClasses: [],
                    validation: {
                        defaultValidation: {
                            allowedValues: {
                                type: "oneOf",
                                options: [
                                    {
                                        displayName: "Public option",
                                        value: "public",
                                    },
                                ],
                                otherValuesAllowed: false,
                            },
                        },
                    },
                },
            }),
            omsActionMetadata(
                "country",
                omsOneOf([{ label: "OMS option", value: "oms" }])
            )
        );

        expect(result.parameters[0]?.type).toMatchObject({
            kind: "string",
            value: {
                constraint: {
                    kind: "enum",
                    value: {
                        options: [
                            {
                                value: "public",
                                label: "Public option",
                            },
                        ],
                    },
                },
            },
        });
    });
});

describe("convertFoundryMetaActionType OMS defaults", () => {
    it("converts static and object-property prefills to parameter defaults", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                assignee: {
                    displayName: "Assignee",
                    dataType: {
                        type: "object",
                        objectTypeApiName: "User",
                        objectApiName: "User",
                    },
                    required: true,
                    typeClasses: [],
                },
                assigneeName: {
                    displayName: "Assignee name",
                    dataType: { type: "string" },
                    required: false,
                    typeClasses: [],
                },
                notes: {
                    displayName: "Notes",
                    dataType: { type: "string" },
                    required: false,
                    typeClasses: [],
                },
            }),
            {
                actionTypeLogic: {
                    validation: {
                        parameterValidations: {
                            assigneeName: {
                                defaultValidation: {
                                    display: {
                                        prefill: {
                                            type: "objectParameterPropertyValue",
                                            objectParameterPropertyValue: {
                                                parameterId: "assignee",
                                                propertyTypeId: "name",
                                            },
                                        },
                                    },
                                },
                            },
                            notes: {
                                defaultValidation: {
                                    display: {
                                        prefill: {
                                            type: "staticValue",
                                            staticValue: {
                                                type: "string",
                                                string: "from-foundry",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            } as never
        );

        expect(result.parameters).toMatchObject([
            {
                name: "assignee",
            },
            {
                name: "assigneeName",
                defaultValue: {
                    kind: "valueReference",
                    value: {
                        path: ["assignee", "name"],
                    },
                },
            },
            {
                name: "notes",
                defaultValue: {
                    kind: "literal",
                    value: {
                        value: "from-foundry",
                    },
                },
            },
        ]);
    });

    it("omits object-query prefills", () => {
        const objectSet = {
            objectSet: {
                startingObjectSet: {
                    type: "base",
                    base: { objectTypeId: "jfubb6is.user" },
                },
                transforms: [
                    {
                        type: "propertyFilter",
                        propertyFilter: {
                            type: "exactMatch",
                            exactMatch: {
                                propertyId: "email",
                                terms: [
                                    {
                                        type: "string",
                                        string: "owner@example.com",
                                    },
                                ],
                            },
                        },
                    },
                    {
                        type: "propertyFilter",
                        propertyFilter: {
                            type: "parameterizedExactMatch",
                            parameterizedExactMatch: {
                                propertyId: "department",
                                terms: [
                                    {
                                        type: "unresolved",
                                        unresolved: {
                                            parameterId: "departments",
                                        },
                                    },
                                ],
                            },
                        },
                    },
                ],
            },
            conditionValues: {
                departments: {
                    type: "staticValue",
                    staticValue: {
                        type: "stringList",
                        stringList: {
                            strings: ["Engineering", "Operations"],
                        },
                    },
                },
            },
        };
        const result = convertFoundryMetaActionType(
            actionType({
                assignee: {
                    displayName: "Assignee",
                    dataType: {
                        type: "object",
                        objectTypeApiName: "User",
                        objectApiName: "jfubb6is.user",
                    },
                    required: false,
                    typeClasses: [],
                },
            }),
            {
                actionTypeLogic: {
                    validation: {
                        parameterValidations: {
                            assignee: {
                                defaultValidation: {
                                    display: {
                                        prefill: {
                                            type: "objectQueryPrefill",
                                            objectQueryPrefill: { objectSet },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            } as never
        );

        expect(result.parameters[0]?.defaultValue).toBeUndefined();
    });

    it("normalizes typed OMS date and list values", () => {
        const result = convertFoundryMetaActionType(
            actionType({
                dueDate: {
                    displayName: "Due date",
                    dataType: { type: "date" },
                    required: false,
                    typeClasses: [],
                },
                tags: {
                    displayName: "Tags",
                    dataType: {
                        type: "array",
                        subType: { type: "string" },
                    },
                    required: false,
                    typeClasses: [],
                },
            }),
            {
                actionTypeLogic: {
                    validation: {
                        parameterValidations: {
                            dueDate: {
                                defaultValidation: {
                                    display: {
                                        prefill: {
                                            type: "staticValue",
                                            staticValue: {
                                                type: "date",
                                                date: { dateValue: "2026-08-31" },
                                            },
                                        },
                                    },
                                },
                            },
                            tags: {
                                defaultValidation: {
                                    display: {
                                        prefill: {
                                            type: "staticValue",
                                            staticValue: {
                                                type: "stringList",
                                                stringList: {
                                                    strings: ["priority", "customer"],
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            } as never
        );

        const dueDateDefault = result.parameters[0]?.defaultValue;
        const tagsDefault = result.parameters[1]?.defaultValue;
        expect(dueDateDefault?.kind).toBe("literal");
        expect(tagsDefault?.kind).toBe("literal");
        if (dueDateDefault?.kind !== "literal" || tagsDefault?.kind !== "literal") {
            throw new Error("Expected literal defaults.");
        }
        const date = dueDateDefault.value.value;
        expect(date).toBeInstanceOf(Temporal.PlainDate);
        expect((date as Temporal.PlainDate).toString()).toBe("2026-08-31");
        expect(tagsDefault.value.value).toEqual([
            "priority",
            "customer",
        ]);
    });

});

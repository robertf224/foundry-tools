import { bulkLoadOntologyEntities } from "@osdk/client.unstable";
import type { OntologyClient } from "@party-stack/foundry-client";

const ONTOLOGY_METADATA_API_PATH = "/ontology-metadata/api";
const OMS_BULK_LOAD_LIMIT = 100;

type BulkLoadResponse = Awaited<
    ReturnType<typeof bulkLoadOntologyEntities>
>;
type ActionTypeLoadResponse = NonNullable<
    BulkLoadResponse["actionTypes"][number]
>;
type OmsActionType = ActionTypeLoadResponse["actionType"];
type OmsObjectType = NonNullable<
    NonNullable<BulkLoadResponse["objectTypes"][number]>["objectType"]
>;

export interface ActionTypeOmsMetadata {
    actionType: OmsActionType;
    propertyApiNamesByParameter: ReadonlyMap<
        string,
        ReadonlyMap<string, string>
    >;
}

interface ObjectTypeDependency {
    objectTypeId: string;
    ontologyVersion: string;
}

function objectTypeDependencyKey(
    dependency: ObjectTypeDependency
): string {
    return `${dependency.ontologyVersion}\0${dependency.objectTypeId}`;
}

function getActionParameterObjectTypeId(
    actionType: OmsActionType,
    parameterId: string
): string | undefined {
    const parameter =
        actionType.metadata.parameters[parameterId];
    return parameter?.type.type === "objectReference"
        ? parameter.type.objectReference.objectTypeId
        : undefined;
}

export async function loadActionTypeOmsMetadata(
    client: OntologyClient,
    actionTypeRids: string[]
): Promise<Map<string, ActionTypeOmsMetadata>> {
    const actionTypes = new Map<
        string,
        ActionTypeLoadResponse
    >();
    const context = {
        baseUrl: new URL(client.baseUrl).origin,
        servicePath: ONTOLOGY_METADATA_API_PATH,
        tokenProvider: client.tokenProvider,
        fetchFn: client.fetch,
    };

    for (let index = 0; index < actionTypeRids.length; index += OMS_BULK_LOAD_LIMIT) {
        const rids = actionTypeRids.slice(index, index + OMS_BULK_LOAD_LIMIT);
        try {
            const response = await bulkLoadOntologyEntities(
                context,
                undefined,
                {
                    actionTypes: rids.map((rid) => ({ rid })),
                    datasourceTypes: [],
                    linkTypes: [],
                    objectTypes: [],
                    sharedPropertyTypes: [],
                    interfaceTypes: [],
                    typeGroups: [],
                }
            );
            response.actionTypes.forEach((result, resultIndex) => {
                const rid = rids[resultIndex];
                if (rid && result?.actionType) {
                    actionTypes.set(rid, result);
                }
            });
        } catch (error) {
            // OMS is an unstable/private compatibility API. Public action
            // metadata must remain usable when this endpoint is unavailable.
            console.warn(
                "Failed to load Foundry OMS action metadata; continuing with public metadata.",
                error
            );
        }
    }

    const dependencies = new Map<
        string,
        ObjectTypeDependency
    >();
    for (const {
        actionType,
        ontologyVersion,
    } of actionTypes.values()) {
        for (const validation of Object.values(
            actionType.actionTypeLogic.validation
                .parameterValidations
        )) {
            const prefill =
                validation.defaultValidation.display?.prefill;
            if (
                prefill?.type !==
                "objectParameterPropertyValue"
            ) {
                continue;
            }
            const objectTypeId =
                getActionParameterObjectTypeId(
                    actionType,
                    prefill.objectParameterPropertyValue
                        .parameterId
                );
            if (!objectTypeId) continue;

            const dependency = {
                objectTypeId,
                ontologyVersion,
            };
            dependencies.set(
                objectTypeDependencyKey(dependency),
                dependency
            );
        }
    }

    const objectTypes = new Map<string, OmsObjectType>();
    const allDependencies = [...dependencies.values()];
    for (
        let index = 0;
        index < allDependencies.length;
        index += OMS_BULK_LOAD_LIMIT
    ) {
        const batch = allDependencies.slice(
            index,
            index + OMS_BULK_LOAD_LIMIT
        );
        try {
            const response = await bulkLoadOntologyEntities(
                context,
                undefined,
                {
                    actionTypes: [],
                    datasourceTypes: [],
                    linkTypes: [],
                    objectTypes: batch.map(
                        ({ objectTypeId, ontologyVersion }) => ({
                            identifier: {
                                type: "objectTypeId",
                                objectTypeId,
                            },
                            versionReference: {
                                type: "ontologyVersion",
                                ontologyVersion,
                            },
                        })
                    ),
                    loadRedacted: true,
                    includeObjectTypesWithoutSearchableDatasources:
                        true,
                    sharedPropertyTypes: [],
                    interfaceTypes: [],
                    typeGroups: [],
                }
            );
            response.objectTypes.forEach(
                (result, resultIndex) => {
                    const dependency = batch[resultIndex];
                    if (dependency && result?.objectType) {
                        objectTypes.set(
                            objectTypeDependencyKey(
                                dependency
                            ),
                            result.objectType
                        );
                    }
                }
            );
        } catch (error) {
            console.warn(
                "Failed to load Foundry OMS object metadata; object-property action defaults will be omitted.",
                error
            );
        }
    }

    return new Map(
        [...actionTypes].map(([rid, response]) => {
            const propertyApiNamesByParameter = new Map<
                string,
                Map<string, string>
            >();
            for (const validation of Object.values(
                response.actionType.actionTypeLogic.validation
                    .parameterValidations
            )) {
                const prefill =
                    validation.defaultValidation.display?.prefill;
                if (
                    prefill?.type !==
                    "objectParameterPropertyValue"
                ) {
                    continue;
                }
                const { parameterId, propertyTypeId } =
                    prefill.objectParameterPropertyValue;
                const objectTypeId =
                    getActionParameterObjectTypeId(
                        response.actionType,
                        parameterId
                    );
                if (!objectTypeId) continue;
                const objectType = objectTypes.get(
                    objectTypeDependencyKey({
                        objectTypeId,
                        ontologyVersion:
                            response.ontologyVersion,
                    })
                );
                const propertyApiName = Object.values(
                    objectType?.propertyTypes ?? {}
                ).find(
                    (property) =>
                        property.id === propertyTypeId
                )?.apiName;
                if (!propertyApiName) continue;

                const properties =
                    propertyApiNamesByParameter.get(
                        parameterId
                    ) ?? new Map<string, string>();
                properties.set(
                    propertyTypeId,
                    propertyApiName
                );
                propertyApiNamesByParameter.set(
                    parameterId,
                    properties
                );
            }

            return [
                rid,
                {
                    actionType: response.actionType,
                    propertyApiNamesByParameter,
                },
            ];
        })
    );
}

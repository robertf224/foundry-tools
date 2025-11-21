import { Client } from "@osdk/client";

export function getConjureContext(client: Client, path: string) {
    return {
        ...client.__osdkClientContext,
        servicePath: path,
    };
}

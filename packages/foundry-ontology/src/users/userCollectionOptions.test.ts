import { ilike, IR, or } from "@tanstack/db";
import { describe, expect, it } from "vitest";
import type { Lens } from "@party-stack/ontology";
import { convertQuery } from "./userCollectionOptions.js";

const identityLens = { operations: [] } satisfies Lens;

describe("convertQuery", () => {
    it("converts OR-wrapped ilike predicates with the same term to a user search", () => {
        const where = or(
            ilike(new IR.PropRef<string>(["username"]), "alex%"),
            ilike(new IR.PropRef<string>(["givenName"]), "alex%"),
            ilike(new IR.PropRef<string>(["familyName"]), "alex%")
        );

        expect(convertQuery({ where }, identityLens)).toEqual({
            type: "search",
            query: "alex",
        });
    });

    it("falls back to listing when OR search terms differ", () => {
        const where = or(
            ilike(new IR.PropRef<string>(["givenName"]), "alex%"),
            ilike(new IR.PropRef<string>(["familyName"]), "robin%")
        );

        expect(convertQuery({ where }, identityLens)).toEqual({ type: "list" });
    });
});

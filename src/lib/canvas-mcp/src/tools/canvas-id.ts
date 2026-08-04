import { z } from "zod";

const SIGNED_BIGINT_MAX = "9223372036854775807";
const isWithinSignedBigintRange = (value: string) =>
    value.length < SIGNED_BIGINT_MAX.length ||
    (value.length === SIGNED_BIGINT_MAX.length && value <= SIGNED_BIGINT_MAX);
const decimalCanvasId = z
    .string()
    .regex(/^[1-9]\d*$/, "Expected a positive decimal Canvas ID")
    .refine(
        (value) => !/^[1-9]\d*$/.test(value) || isWithinSignedBigintRange(value),
        "Canvas ID exceeds the signed 64-bit range",
    );

/**
 * Canvas may return 64-bit IDs as strings. Keep those strings intact through
 * MCP input validation and URL construction; accepting a number is retained
 * only for callers whose IDs are safely representable in JavaScript.
 */
export const canvasIdSchema = z
    .union([
        decimalCanvasId,
        z.number().int().positive().refine(Number.isSafeInteger, "Expected a safe integer Canvas ID"),
    ])
    .transform(String);

/** Canvas accepts `self` in selected user-ID parameters. */
export const canvasUserIdSchema = z.union([canvasIdSchema, z.literal("self")]);

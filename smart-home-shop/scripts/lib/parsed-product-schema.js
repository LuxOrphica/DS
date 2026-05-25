const { z } = require("zod");
/** @type {any} */
const tinyInvariant = require("tiny-invariant");
/** @type {(condition: unknown, message?: string) => asserts condition} */
const invariant = tinyInvariant.default || tinyInvariant;

const stringField = (max = 2000) => z.string().trim().max(max);

const parsedAttributeSchema = z.object({
  name: stringField(200).min(1),
  value: stringField(2000).min(1)
}).passthrough();

const sourceReferenceSchema = z.string().trim().min(1).max(2000).refine(
  (value) => /^https?:\/\//i.test(value) || value.startsWith("/"),
  "reference must be an http(s) URL or site-root path"
);

const parsedDocumentSchema = z.object({
  title: stringField(300).min(1),
  url: sourceReferenceSchema,
  meta: stringField(1000).optional()
}).passthrough();

function parseArrayJson(raw, ctx, itemSchema, label) {
  try {
    const parsed = JSON.parse(raw || "[]");
    const result = z.array(itemSchema).safeParse(parsed);
    if (!result.success) {
      ctx.addIssue({ code: "custom", message: `${label} must contain valid items` });
      return z.NEVER;
    }
    return raw;
  } catch {
    ctx.addIssue({ code: "custom", message: `${label} must be valid JSON` });
    return z.NEVER;
  }
}

const parsedProductSchema = z.object({
  id: stringField(200).min(1),
  article: stringField(200).min(1),
  name: stringField(500).min(1),
  price: z.number().finite().nonnegative().nullable(),
  category: stringField(300).min(1),
  group_name: stringField(500).min(1),
  brand: stringField(200).min(1),
  image: stringField(2000),
  source_url: stringField(2000).min(1),
  description: stringField(20_000),
  specs: stringField(20_000),
  description_html: stringField(50_000),
  attributes_json: z.string().transform((raw, ctx) => {
    try {
      const parsed = JSON.parse(raw || "[]");
      const result = z.array(parsedAttributeSchema).safeParse(parsed);
      if (!result.success) {
        ctx.addIssue({ code: "custom", message: "attributes_json must contain parsed attributes" });
        return z.NEVER;
      }
      return raw;
    } catch {
      ctx.addIssue({ code: "custom", message: "attributes_json must be valid JSON" });
      return z.NEVER;
    }
  }),
  documents_json: z.string().transform((raw, ctx) => parseArrayJson(raw, ctx, parsedDocumentSchema, "documents_json")),
  gallery_json: z.string().transform((raw, ctx) => parseArrayJson(raw, ctx, sourceReferenceSchema, "gallery_json")),
  updated_at: stringField(100)
}).strict();

function assertParsedProduct(product, context = "parsed product") {
  invariant(product && typeof product === "object", `${context}: product payload must be an object`);
  invariant(!String(product.id || "").includes("\uFFFD"), `${context}: id contains replacement character`);
  invariant(!String(product.name || "").includes("\uFFFD"), `${context}: name contains replacement character`);
  invariant(!String(product.article || "").includes("\uFFFD"), `${context}: article contains replacement character`);

  const parsed = parsedProductSchema.safeParse(product);
  invariant(parsed.success, `${context}: ${parsed.success ? "" : parsed.error.issues.map((issue) => `${issue.path.join(".") || "<root>"} ${issue.message}`).join("; ")}`);
  return parsed.data;
}

module.exports = {
  assertParsedProduct,
  parsedAttributeSchema,
  parsedDocumentSchema,
  parsedProductSchema
};

import { z } from "zod";

/**
 * Unified Zod Schema definitions for DrawIO AI tool parameters.
 * Single source of truth for drawio_read / drawio_edit_batch validation.
 */

export const operationSchema = z
  .object({
    type: z
      .enum([
        "set_attribute",
        "remove_attribute",
        "insert_element",
        "remove_element",
        "replace_element",
        "set_text_content",
      ])
      .describe(
        "Operation type: set/remove attribute, insert/delete/replace element, or set text content",
      ),
    xpath: z
      .string()
      .optional()
      .describe(
        "XPath expression for targeting. Use either xpath OR id, not both. If both provided, id takes precedence",
      ),
    id: z
      .string()
      .optional()
      .describe(
        "mxCell ID for quick targeting (auto-converts to XPath). Preferred over xpath for single elements",
      ),
    key: z
      .string()
      .optional()
      .describe(
        "Attribute name. Required for set_attribute and remove_attribute operations",
      ),
    value: z
      .string()
      .optional()
      .describe(
        "Attribute value or text content. Required for set_attribute and set_text_content",
      ),
    new_xml: z
      .string()
      .optional()
      .describe(
        `XML fragment for insert/replace. Format rules:
- Style: semicolon-separated, NO trailing semicolon (e.g., "ellipse;fillColor=#fff")
- Self-closing tags: NO space before /> (e.g., as="geometry"/>)
- Avoid: whiteSpace=wrap, html=1, aspect=fixed in style
Example: <mxCell id="x" style="ellipse;fillColor=#fff" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="80" as="geometry"/></mxCell>`,
      ),
    position: z
      .enum(["append_child", "prepend_child", "before", "after"])
      .optional()
      .describe(
        "Insert position for insert_element: append_child (default, as last child), prepend_child (as first child), before (as previous sibling), after (as next sibling)",
      ),
    allow_no_match: z
      .boolean()
      .optional()
      .describe(
        "If true, skip this operation when target not found instead of failing. Default: false (fail on no match)",
      ),
  })
  .describe("Single operation for drawio_edit_batch")
  .superRefine((operation, ctx) => {
    const ensureNonEmptyIfProvided = (
      value: string | undefined,
      path: (string | number)[],
      message: string,
    ) => {
      if (value === undefined) return;

      if (typeof value !== "string" || value.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message,
        });
      }
    };

    const hasXpath =
      typeof operation.xpath === "string" && operation.xpath.trim() !== "";
    const hasId =
      typeof operation.id === "string" && operation.id.trim() !== "";

    if (!hasXpath && !hasId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Either 'xpath' or 'id' must be provided for element targeting",
      });
    }

    ensureNonEmptyIfProvided(
      operation.xpath,
      ["xpath"],
      "xpath cannot be empty string",
    );
    ensureNonEmptyIfProvided(operation.id, ["id"], "id cannot be empty string");

    switch (operation.type) {
      case "set_attribute": {
        if (operation.key === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["key"],
            message: "'key' is required for set_attribute operation",
          });
        }
        ensureNonEmptyIfProvided(
          operation.key,
          ["key"],
          "key cannot be empty string",
        );
        if (typeof operation.value !== "string") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["value"],
            message: "'value' must be a string for set_attribute operation",
          });
        }
        break;
      }
      case "remove_attribute": {
        if (operation.key === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["key"],
            message: "'key' is required for remove_attribute operation",
          });
        }
        ensureNonEmptyIfProvided(
          operation.key,
          ["key"],
          "key cannot be empty string",
        );
        break;
      }
      case "insert_element":
      case "replace_element": {
        if (operation.new_xml === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["new_xml"],
            message: `'new_xml' is required for ${operation.type} operation`,
          });
        }
        ensureNonEmptyIfProvided(
          operation.new_xml,
          ["new_xml"],
          "new_xml cannot be empty string",
        );
        break;
      }
      case "remove_element": {
        break;
      }
      case "set_text_content": {
        if (typeof operation.value !== "string") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["value"],
            message: "'value' must be a string for set_text_content operation",
          });
        }
        break;
      }
      default:
        break;
    }
  });

export const drawioReadInputSchema = z
  .object({
    xpath: z
      .string()
      .optional()
      .describe(
        "XPath expression for querying. Example: //mxCell[@vertex='1'] to find all shapes",
      ),
    id: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        "Query by mxCell ID. Accepts single string or array of strings. Example: 'node-1' or ['node-1', 'node-2']",
      ),
    filter: z
      .enum(["all", "vertices", "edges"])
      .optional()
      .describe(
        "Filter for ls mode (when no xpath/id provided): 'all' (default), 'vertices' (shapes only), 'edges' (connectors only)",
      ),
    description: z
      .string()
      .optional()
      .describe(
        "Optional description of this read operation for logging. Example: 'Query login button style'",
      ),
  })
  .describe("Input parameters for drawio_read tool")
  .superRefine((data, ctx) => {
    if (data.xpath && data.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cannot use both 'xpath' and 'id' together. Choose one locator method",
      });
    }

    if (data.filter && (data.xpath || data.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "'filter' is only valid in ls mode (when neither xpath nor id is provided)",
      });
    }
  });

export const drawioEditBatchInputSchema = z
  .object({
    operations: z
      .array(operationSchema)
      .min(1, "operations must contain at least one operation")
      .describe(
        "Array of operations to execute in order. Execution stops at the first failed/blocked operation",
      ),
    description: z
      .string()
      .optional()
      .describe(
        "Optional description of this batch edit for logging. Example: 'Change login button to red'",
      ),
  })
  .describe("Input for drawio_edit_batch: batch edit request body");

// --------- Type exports (single source of truth) ---------
/**
 * Single atomic operation type for batch editing.
 * Replaces the original definition in app/types/drawio-tools.ts.
 */
export type DrawioEditOperation = z.infer<typeof operationSchema>;
/**
 * drawio_read input parameter type (inferred from zod).
 */
export type DrawioReadInput = z.infer<typeof drawioReadInputSchema>;
/**
 * Batch edit input type (operations array wrapper).
 */
export type DrawioEditBatchRequest = z.infer<typeof drawioEditBatchInputSchema>;

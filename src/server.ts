import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPrepGuidance } from "./tools/getPrepGuidance.js";

/** Builds a fresh, fully-configured stormwise MCP server instance. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "stormwise",
    version: "0.1.0",
  });

  server.tool(
    "get_weather_prep_guidance",
    "Given a location (city, address, or place name), returns severe weather prep guidance " +
      "that reasons about live official alerts (US National Weather Service) and current " +
      "conditions together, tailored to the specific region and threat — not a generic safety " +
      "checklist. Optionally accepts free-text context (e.g. household details relevant to prep).",
    {
      location: z
        .string()
        .describe('A place to get prep guidance for, e.g. "Tampa, FL" or "Minneapolis, MN".'),
      context: z
        .string()
        .optional()
        .describe("Optional extra context, e.g. household size, pets, mobility needs."),
    },
    async ({ location, context }) => {
      try {
        const result = await getPrepGuidance({ location, context });
        const stepsList = result.prepSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");
        const coverageNote =
          result.alertsCoverage === "unsupported"
            ? "\n\n(Official alert data isn't available outside the US — this reasoning is " +
              "based on region and current conditions only.)"
            : "";

        return {
          content: [
            {
              type: "text",
              text:
                `${result.reasoning}\n\n${stepsList}\n\n` +
                `(${result.location} — ${result.conditions} — severity: ${result.severity})` +
                coverageNote,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Couldn't get prep guidance: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  return server;
}

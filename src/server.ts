import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPrepGuidance } from "./tools/getPrepGuidance.js";
import { refinePrepGuidance } from "./tools/refinePrepGuidance.js";
import { rememberPreference } from "./tools/rememberPreference.js";

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
      "checklist. Optionally accepts free-text context (e.g. household details relevant to " +
      "prep). Pass a session_id (any stable id for this conversation/customer) to apply " +
      "remembered household details and to enable refine_prep_guidance as a follow-up.",
    {
      location: z
        .string()
        .describe('A place to get prep guidance for, e.g. "Tampa, FL" or "Minneapolis, MN".'),
      context: z
        .string()
        .optional()
        .describe("Optional extra context, e.g. household size, pets, mobility needs."),
      session_id: z
        .string()
        .optional()
        .describe(
          "Stable id for this conversation/customer. When set, remembered household details " +
            "(remember_preference) are applied, and the result can be refined afterward with " +
            "refine_prep_guidance using the same id."
        ),
    },
    async ({ location, context, session_id }) => {
      try {
        const result = await getPrepGuidance({ location, context, sessionId: session_id });
        const stepsList = result.prepSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");
        const coverageNote =
          result.alertsCoverage === "unsupported"
            ? "\n\n(Official alert data isn't available outside the US — this reasoning is " +
              "based on region and current conditions only.)"
            : "";
        const sessionLine = result.sessionId
          ? `\n\n[session_id: ${result.sessionId} — pass this to remember_preference or ` +
            `refine_prep_guidance to continue this conversation]`
          : "";

        return {
          content: [
            {
              type: "text",
              text:
                `${result.reasoning}\n\n${stepsList}\n\n` +
                `(${result.location} — ${result.conditions} — severity: ${result.severity})` +
                coverageNote +
                sessionLine,
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

  server.tool(
    "refine_prep_guidance",
    "Follow-up to get_weather_prep_guidance for the same session — use this when the customer " +
      "reacts to the last guidance instead of asking a fresh question, e.g. \"we don't have a " +
      "car\", \"already did the emergency kit, what's next\", \"what about our pets\". Reuses " +
      "the session's cached location, conditions, and alerts (no re-fetching) and builds on " +
      "guidance already given instead of repeating it.",
    {
      session_id: z
        .string()
        .describe("The session_id returned by an earlier get_weather_prep_guidance call."),
      feedback: z
        .string()
        .describe('What the customer said in response, e.g. "we have no vehicle to evacuate with".'),
    },
    async ({ session_id, feedback }) => {
      try {
        const result = await refinePrepGuidance({ sessionId: session_id, feedback });
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
              text: `Couldn't refine the prep guidance: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "remember_preference",
    "Stores a standing household detail relevant to prep guidance (e.g. \"no car\", \"elderly " +
      "or disabled household member\", \"two dogs\", \"mobility needs\") for a session, so " +
      "future get_weather_prep_guidance and refine_prep_guidance calls with the same " +
      "session_id apply it automatically without the customer repeating themselves.",
    {
      session_id: z.string().describe("Stable id for this conversation/customer."),
      preference: z
        .string()
        .describe('The detail to remember, e.g. "no car" or "elderly resident".'),
    },
    async ({ session_id, preference }) => {
      const result = rememberPreference({ sessionId: session_id, preference });
      return {
        content: [
          {
            type: "text",
            text:
              result.preferences.length > 0
                ? `Got it — I'll remember: ${result.preferences.join("; ")}.`
                : "Got it.",
          },
        ],
      };
    }
  );

  return server;
}

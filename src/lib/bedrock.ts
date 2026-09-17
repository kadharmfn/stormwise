import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { GeocodedLocation } from "./geocode.js";
import type { CurrentConditions } from "./weather.js";
import type { WeatherAlert } from "./alerts.js";

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const ALERT_AWARE_SYSTEM_PROMPT = `You are a calm, knowledgeable local emergency-preparedness \
advisor. Given a place, its current conditions, and any active official weather alerts there, \
tell the person specifically what to do to prepare — right now, for their exact region and \
situation.

Reason like someone who has lived through this region's specific weather threats, not a generic \
safety checklist. A hurricane warning on the Florida coast means shutters, evacuation routes, and \
a hurricane kit. A blizzard warning in Minnesota means pipe insulation, a car emergency kit, and \
carbon-monoxide-safe heating. A wildfire-prone area under red flag conditions means a go-bag, \
defensible space, and knowing the evacuation zone. Match the guidance to the actual threat and \
region — don't give generic "stay safe" advice.

If there are no active alerts, say so plainly and briefly — don't invent urgency that isn't \
there. You may add one light, non-alarmist seasonal readiness note for the region if relevant, \
but keep it brief.

Respond in a calm, clear, conversational tone suitable for a voice assistant to read aloud. Be \
specific and actionable, not vague.`;

// Deliberately generic — used as an "alert-blind" baseline for comparison: reasoning about the
// region/season only, without the live official alert data.
const BASELINE_SYSTEM_PROMPT = `You are a general weather-safety assistant. Given a place, give \
brief, generic seasonal weather safety tips for that region. Respond in a calm, conversational \
tone suitable for a voice assistant to read aloud.`;

const PREP_GUIDANCE_TOOL = {
  name: "prep_guidance",
  description: "Return structured severe-weather prep guidance.",
  input_schema: {
    type: "object",
    properties: {
      primary_concern: {
        type: "string",
        description:
          'The main thing to prepare for right now, e.g. "flash flooding from a severe ' +
          'thunderstorm warning" or "no active alerts right now" if there is nothing active.',
      },
      severity: {
        type: "string",
        enum: ["none", "minor", "moderate", "severe", "extreme"],
        description: "Overall severity level to convey to the person.",
      },
      prep_steps: {
        type: "array",
        items: { type: "string" },
        description: "2-5 specific, regionally-appropriate prep actions, most important first.",
      },
      reasoning: {
        type: "string",
        description:
          "2-4 sentence explanation, phrased for a voice assistant to read aloud, calm and " +
          "specific to the region and threat.",
      },
    },
    required: ["primary_concern", "severity", "prep_steps", "reasoning"],
  },
} as const;

export interface PrepGuidance {
  primaryConcern: string;
  severity: string;
  prepSteps: string[];
  reasoning: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface PrepReasoningInput {
  location: GeocodedLocation;
  conditions: CurrentConditions;
  alerts: WeatherAlert[];
  alertsCoverage: "supported" | "unsupported";
  context?: string;
  /** Set false to get an alert-blind baseline (region/season only), for comparison purposes. */
  includeAlerts?: boolean;
}

export async function reasonAboutPrep(input: PrepReasoningInput): Promise<PrepGuidance> {
  const {
    location,
    conditions,
    alerts,
    alertsCoverage,
    context,
    includeAlerts = true,
  } = input;

  const locationLine = `Location: ${location.formattedAddress}${
    location.region ? ` (${location.region}, ${location.country ?? ""})` : ""
  }`;
  const conditionsLine = `Current conditions: ${conditions.description}, ${conditions.temperatureC}°C, wind ${conditions.windSpeedKph} km/h (gusts ${conditions.windGustsKph} km/h), ${conditions.precipitationMm}mm precipitation.`;

  let alertsLine: string;
  if (!includeAlerts) {
    alertsLine = "";
  } else if (alertsCoverage === "unsupported") {
    alertsLine =
      "Official alert data isn't available for this location (only covers the US) — reason " +
      "from the region and current conditions only.";
  } else if (alerts.length === 0) {
    alertsLine = "No active official weather alerts for this location right now.";
  } else {
    alertsLine =
      "Active official alerts:\n" +
      alerts
        .map(
          (a) =>
            `- ${a.event} (severity: ${a.severity}, urgency: ${a.urgency}) for ${a.areaDesc}: ${a.headline}`
        )
        .join("\n");
  }

  const contextLine = context ? `Additional context from the requester: ${context}` : "";

  const userPrompt = [
    locationLine,
    conditionsLine,
    alertsLine,
    contextLine,
    "What should I do to prepare right now?",
  ]
    .filter(Boolean)
    .join("\n");

  const modelId = process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-sonnet-4-6-v1:0";

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
      system: includeAlerts ? ALERT_AWARE_SYSTEM_PROMPT : BASELINE_SYSTEM_PROMPT,
      tools: [PREP_GUIDANCE_TOOL],
      tool_choice: { type: "tool", name: PREP_GUIDANCE_TOOL.name },
      messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
    }),
  });

  const response = await client.send(command);
  const payload = JSON.parse(new TextDecoder().decode(response.body));

  const toolUse = payload?.content?.find(
    (block: { type: string }) => block.type === "tool_use"
  ) as
    | {
        input?: {
          primary_concern?: string;
          severity?: string;
          prep_steps?: string[];
          reasoning?: string;
        };
      }
    | undefined;

  if (!toolUse?.input) {
    throw new Error("Bedrock response did not contain a prep_guidance tool call.");
  }

  const { primary_concern, severity, prep_steps, reasoning } = toolUse.input;
  if (!primary_concern || !severity || !prep_steps || !reasoning) {
    throw new Error("Bedrock's prep_guidance call was missing required fields.");
  }

  return {
    primaryConcern: primary_concern,
    severity,
    prepSteps: prep_steps,
    reasoning,
    usage: {
      inputTokens: payload?.usage?.input_tokens ?? 0,
      outputTokens: payload?.usage?.output_tokens ?? 0,
    },
  };
}

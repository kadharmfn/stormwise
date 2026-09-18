import { reasonAboutPrep } from "../lib/bedrock.js";
import { getSession, touchSession } from "../lib/session.js";

export interface RefinePrepGuidanceArgs {
  sessionId: string;
  /** Follow-up from the customer, e.g. "we don't have a car", "already did the kit, what's next". */
  feedback: string;
}

export interface RefinePrepGuidanceResult {
  location: string;
  conditions: string;
  alertsCoverage: "supported" | "unsupported";
  activeAlertCount: number;
  primaryConcern: string;
  severity: string;
  prepSteps: string[];
  reasoning: string;
}

export async function refinePrepGuidance(
  args: RefinePrepGuidanceArgs
): Promise<RefinePrepGuidanceResult> {
  const session = getSession(args.sessionId);
  if (!session?.lastLocation || !session.lastConditions || !session.lastPrepSteps) {
    throw new Error(
      "No prior prep guidance found for this session — call get_weather_prep_guidance with " +
        "this session_id first."
    );
  }

  session.coveredSteps.push(...session.lastPrepSteps);

  const contextParts = [
    session.preferences.length > 0
      ? `Standing household details from this customer: ${session.preferences.join("; ")}.`
      : "",
    `Guidance already given: ${session.coveredSteps.join("; ")}.`,
    `Customer follow-up: "${args.feedback}". Address this directly — don't just repeat the ` +
      "steps already given verbatim.",
  ].filter(Boolean);

  const guidance = await reasonAboutPrep({
    location: session.lastLocation,
    conditions: session.lastConditions,
    alerts: session.lastAlerts ?? [],
    alertsCoverage: session.lastAlertsCoverage ?? "unsupported",
    context: contextParts.join("\n"),
  });

  session.lastPrepSteps = guidance.prepSteps;
  touchSession(session);

  return {
    location: session.lastLocation.formattedAddress,
    conditions: `${session.lastConditions.description}, ${session.lastConditions.temperatureC}°C, wind ${session.lastConditions.windSpeedKph} km/h`,
    alertsCoverage: session.lastAlertsCoverage ?? "unsupported",
    activeAlertCount: (session.lastAlerts ?? []).length,
    primaryConcern: guidance.primaryConcern,
    severity: guidance.severity,
    prepSteps: guidance.prepSteps,
    reasoning: guidance.reasoning,
  };
}

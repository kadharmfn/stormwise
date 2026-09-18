import { geocodeLocation } from "../lib/geocode.js";
import { getCurrentConditions } from "../lib/weather.js";
import { getActiveAlerts } from "../lib/alerts.js";
import { reasonAboutPrep } from "../lib/bedrock.js";
import { getOrCreateSession, touchSession } from "../lib/session.js";

export interface GetPrepGuidanceArgs {
  location: string;
  context?: string;
  /** Conversation/session identifier. When set, standing household details are applied and the
   * guidance is cached so refine_prep_guidance can build on it. */
  sessionId?: string;
}

export interface GetPrepGuidanceResult {
  location: string;
  conditions: string;
  alertsCoverage: "supported" | "unsupported";
  activeAlertCount: number;
  primaryConcern: string;
  severity: string;
  prepSteps: string[];
  reasoning: string;
  sessionId?: string;
}

export async function getPrepGuidance(
  args: GetPrepGuidanceArgs
): Promise<GetPrepGuidanceResult> {
  const geocoded = await geocodeLocation(args.location);
  const [conditions, alertsResult] = await Promise.all([
    getCurrentConditions(geocoded.lat, geocoded.lng),
    getActiveAlerts(geocoded.lat, geocoded.lng),
  ]);

  const session = args.sessionId ? getOrCreateSession(args.sessionId) : undefined;
  const contextParts = [
    session && session.preferences.length > 0
      ? `Standing household details from this customer: ${session.preferences.join("; ")}.`
      : "",
    args.context ?? "",
  ].filter(Boolean);

  const guidance = await reasonAboutPrep({
    location: geocoded,
    conditions,
    alerts: alertsResult.alerts,
    alertsCoverage: alertsResult.coverage,
    context: contextParts.join("\n") || undefined,
  });

  if (session) {
    session.lastLocation = geocoded;
    session.lastConditions = conditions;
    session.lastAlerts = alertsResult.alerts;
    session.lastAlertsCoverage = alertsResult.coverage;
    session.lastPrepSteps = guidance.prepSteps;
    session.coveredSteps = [];
    touchSession(session);
  }

  return {
    location: geocoded.formattedAddress,
    conditions: `${conditions.description}, ${conditions.temperatureC}°C, wind ${conditions.windSpeedKph} km/h`,
    alertsCoverage: alertsResult.coverage,
    activeAlertCount: alertsResult.alerts.length,
    primaryConcern: guidance.primaryConcern,
    severity: guidance.severity,
    prepSteps: guidance.prepSteps,
    reasoning: guidance.reasoning,
    sessionId: session?.id,
  };
}

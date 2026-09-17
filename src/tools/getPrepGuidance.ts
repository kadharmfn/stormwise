import { geocodeLocation } from "../lib/geocode.js";
import { getCurrentConditions } from "../lib/weather.js";
import { getActiveAlerts } from "../lib/alerts.js";
import { reasonAboutPrep } from "../lib/bedrock.js";

export interface GetPrepGuidanceArgs {
  location: string;
  context?: string;
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
}

export async function getPrepGuidance(
  args: GetPrepGuidanceArgs
): Promise<GetPrepGuidanceResult> {
  const geocoded = await geocodeLocation(args.location);
  const [conditions, alertsResult] = await Promise.all([
    getCurrentConditions(geocoded.lat, geocoded.lng),
    getActiveAlerts(geocoded.lat, geocoded.lng),
  ]);

  const guidance = await reasonAboutPrep({
    location: geocoded,
    conditions,
    alerts: alertsResult.alerts,
    alertsCoverage: alertsResult.coverage,
    context: args.context,
  });

  return {
    location: geocoded.formattedAddress,
    conditions: `${conditions.description}, ${conditions.temperatureC}°C, wind ${conditions.windSpeedKph} km/h`,
    alertsCoverage: alertsResult.coverage,
    activeAlertCount: alertsResult.alerts.length,
    primaryConcern: guidance.primaryConcern,
    severity: guidance.severity,
    prepSteps: guidance.prepSteps,
    reasoning: guidance.reasoning,
  };
}

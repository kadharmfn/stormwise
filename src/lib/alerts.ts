export interface WeatherAlert {
  event: string; // e.g. "Winter Storm Warning", "Hurricane Watch"
  severity: string; // Extreme | Severe | Moderate | Minor | Unknown
  urgency: string; // Immediate | Expected | Future | Past | Unknown
  headline: string;
  description: string;
  instruction?: string;
  areaDesc: string;
  effective: string;
  expires: string;
}

interface NwsAlertsResponse {
  features: Array<{
    properties: {
      event: string;
      severity: string;
      urgency: string;
      headline: string;
      description: string;
      instruction: string | null;
      areaDesc: string;
      effective: string;
      expires: string;
    };
  }>;
}

/**
 * Active severe weather alerts from the US National Weather Service. US/territories only —
 * NWS doesn't cover other countries. Returns `coverage: "unsupported"` rather than throwing
 * when the point falls outside NWS coverage, so callers can fall back to conditions-only
 * reasoning instead of a hard error.
 */
export async function getActiveAlerts(
  lat: number,
  lng: number
): Promise<{ coverage: "supported" | "unsupported"; alerts: WeatherAlert[] }> {
  const userAgent = process.env.NWS_USER_AGENT ?? "stormwise (unset-contact@example.com)";

  const url = new URL("https://api.weather.gov/alerts/active");
  url.searchParams.set("point", `${lat},${lng}`);

  const res = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "application/geo+json" },
  });

  if (res.status === 404 || res.status === 400) {
    return { coverage: "unsupported", alerts: [] };
  }
  if (!res.ok) {
    throw new Error(`NWS alerts request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as NwsAlertsResponse;
  return {
    coverage: "supported",
    alerts: data.features.map((f) => ({
      event: f.properties.event,
      severity: f.properties.severity,
      urgency: f.properties.urgency,
      headline: f.properties.headline,
      description: f.properties.description,
      instruction: f.properties.instruction ?? undefined,
      areaDesc: f.properties.areaDesc,
      effective: f.properties.effective,
      expires: f.properties.expires,
    })),
  };
}

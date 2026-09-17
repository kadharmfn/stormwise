// Measures real latency, success rate, and (for Bedrock) token usage across US regions with
// different dominant severe-weather threats.
import "dotenv/config";
import { geocodeLocation } from "../src/lib/geocode.js";
import { getCurrentConditions } from "../src/lib/weather.js";
import { getActiveAlerts } from "../src/lib/alerts.js";
import { reasonAboutPrep } from "../src/lib/bedrock.js";

// Rough published Bedrock Claude Sonnet-class pricing — verify against the current Bedrock
// pricing page for the exact model in use.
const INPUT_COST_PER_1M = 3.0;
const OUTPUT_COST_PER_1M = 15.0;
const GEOCODE_COST_PER_CALL = 0.005;

// Spans hurricane-prone Gulf/Atlantic coast, tornado alley, blizzard-prone north, wildfire-prone
// west, and a few generally milder regions for contrast.
const LOCATIONS = [
  "Tampa, FL",
  "Miami, FL",
  "New Orleans, LA",
  "Houston, TX",
  "Oklahoma City, OK",
  "Wichita, KS",
  "Minneapolis, MN",
  "Fargo, ND",
  "Denver, CO",
  "Sacramento, CA",
  "Los Angeles, CA",
  "Seattle, WA",
  "Phoenix, AZ",
  "Honolulu, HI",
  "Anchorage, AK",
];

interface StageResult {
  ok: boolean;
  ms: number;
  error?: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result?: T } & StageResult> {
  const start = performance.now();
  try {
    const result = await fn();
    return { ok: true, ms: performance.now() - start, result };
  } catch (error) {
    return { ok: false, ms: performance.now() - start, error: (error as Error).message };
  }
}

function summarize(label: string, results: StageResult[]) {
  const successes = results.filter((r) => r.ok);
  const successRate = ((successes.length / results.length) * 100).toFixed(0);
  const times = successes.map((r) => r.ms);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const min = times.length ? Math.min(...times) : 0;
  const max = times.length ? Math.max(...times) : 0;
  console.log(
    `${label.padEnd(14)} success ${successRate}% (${successes.length}/${results.length})  ` +
      `avg ${avg.toFixed(0)}ms  min ${min.toFixed(0)}ms  max ${max.toFixed(0)}ms`
  );
}

const estGeocodeCost = LOCATIONS.length * GEOCODE_COST_PER_CALL;
const estBedrockCost = LOCATIONS.length * 0.0075;
console.log(
  `Running ${LOCATIONS.length} locations. Estimated cost: Google ~$${estGeocodeCost.toFixed(2)} ` +
    `(well under the $200/mo free credit), Bedrock ~$${estBedrockCost.toFixed(2)} (no free tier).\n`
);

const geocodeResults: StageResult[] = [];
const conditionsResults: StageResult[] = [];
const alertsResults: StageResult[] = [];
const bedrockResults: StageResult[] = [];
const tokenUsages: { inputTokens: number; outputTokens: number }[] = [];
let alertCountTotal = 0;

for (const location of LOCATIONS) {
  const geo = await timed(() => geocodeLocation(location));
  geocodeResults.push(geo);
  console.log(
    `[${location}] geocode: ${geo.ok ? `ok (${geo.ms.toFixed(0)}ms)` : `FAILED (${geo.error})`}`
  );
  if (!geo.ok || !geo.result) continue;
  const { lat, lng } = geo.result;

  const conditions = await timed(() => getCurrentConditions(lat, lng));
  conditionsResults.push(conditions);
  console.log(
    `[${location}] conditions: ${conditions.ok ? `ok (${conditions.ms.toFixed(0)}ms)` : `FAILED (${conditions.error})`}`
  );

  const alerts = await timed(() => getActiveAlerts(lat, lng));
  alertsResults.push(alerts);
  if (alerts.ok && alerts.result) {
    alertCountTotal += alerts.result.alerts.length;
    console.log(
      `[${location}] alerts: ok (${alerts.ms.toFixed(0)}ms, ${alerts.result.alerts.length} active, coverage=${alerts.result.coverage})`
    );
  } else {
    console.log(`[${location}] alerts: FAILED (${alerts.error})`);
  }

  if (!conditions.ok || !conditions.result || !alerts.ok || !alerts.result) continue;

  const bedrock = await timed(() =>
    reasonAboutPrep({
      location: geo.result!,
      conditions: conditions.result!,
      alerts: alerts.result!.alerts,
      alertsCoverage: alerts.result!.coverage,
    })
  );
  bedrockResults.push(bedrock);
  if (bedrock.ok && bedrock.result) {
    tokenUsages.push(bedrock.result.usage);
    console.log(
      `[${location}] bedrock: ok (${bedrock.ms.toFixed(0)}ms, ${bedrock.result.usage.inputTokens} in / ${bedrock.result.usage.outputTokens} out tok) — ${bedrock.result.primaryConcern} (${bedrock.result.severity})`
    );
  } else {
    console.log(`[${location}] bedrock: FAILED (${bedrock.error})`);
  }
}

console.log(`\n=== Summary across ${LOCATIONS.length} regions ===`);
summarize("geocode", geocodeResults);
summarize("conditions", conditionsResults);
summarize("alerts", alertsResults);
summarize("bedrock", bedrockResults);
console.log(`Total active alerts found across all regions: ${alertCountTotal}`);

if (tokenUsages.length > 0) {
  const avgInput = tokenUsages.reduce((a, u) => a + u.inputTokens, 0) / tokenUsages.length;
  const avgOutput = tokenUsages.reduce((a, u) => a + u.outputTokens, 0) / tokenUsages.length;
  const avgCost =
    (avgInput / 1_000_000) * INPUT_COST_PER_1M + (avgOutput / 1_000_000) * OUTPUT_COST_PER_1M;
  console.log(
    `\nBedrock tokens (measured): avg ${avgInput.toFixed(0)} in / ${avgOutput.toFixed(0)} out`
  );
  console.log(
    `Estimated cost/query: $${avgCost.toFixed(5)} ` +
      `(using $${INPUT_COST_PER_1M}/1M in, $${OUTPUT_COST_PER_1M}/1M out — verify against current Bedrock pricing)`
  );
}

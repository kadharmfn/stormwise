# stormwise

An MCP server that tells you specifically how to prepare for severe weather right now — reasoning
over live official alerts and your exact region, not a generic "stay safe" checklist.

Built for the **Alexa+ track**: Alexa+ acts as the MCP client, discovers
`get_weather_prep_guidance`, `refine_prep_guidance`, and `remember_preference`, and calls them as
a customer asks "how should I prepare right now?", reacts to the guidance ("we have no car"), or
states a standing household detail ("elderly resident") — an agentic workflow that keeps context
across turns, not a single-shot Q&A. A companion project to
[forecast-fork](../forecast-fork) — same architecture pattern (MCP server, Bedrock structured
reasoning, session memory, three demo paths), different real-world problem.

## Why this, not just a rule engine

A hurricane warning on the Florida coast means shutters, evacuation routes, a hurricane kit. A
blizzard warning in Minnesota means pipe insulation, a car emergency kit, carbon-monoxide-safe
heating. A wildfire-prone area under red flag conditions means a go-bag and knowing your
evacuation zone. A generic "prepare an emergency kit" checklist is true everywhere and useful
nowhere — the actual value is reasoning about *this* threat, in *this* region, right now.

**Concrete evidence this matters** (`npm run demo:alert-impact -- "Tucson, AZ"`, real output, not
fabricated): with a live Flash Flood Warning active, the alert-aware version correctly identified
the threat and gave specific, time-bound guidance ("active until 8:45 PM MST," "stay off washes
near the Catalinas and Rincons"). The alert-blind baseline — reasoning from season and conditions
alone, the way a static tips page would — **stated as fact that there were no active alerts**,
which was simply wrong. That's not a vaguer answer, it's an incorrect one. Live official data
isn't a nice-to-have here.

## Architecture

```
Alexa+ (MCP client)
  │  "how should I prepare right now?"
  ▼
get_weather_prep_guidance(location, context?, session_id?)
  │
  ├─▶ geocodeLocation()      Google Geocoding API        → lat/lng, city/region/country
  ├─▶ getCurrentConditions() Open-Meteo (no key)          → temp, wind, gusts, precipitation
  ├─▶ getActiveAlerts()      US National Weather Service  → active official alerts (US-only;
  │                          (no key, needs a User-Agent)   returns "unsupported" coverage elsewhere)
  ├─▶ [session_id] apply remembered household details, cache location/conditions/alerts/steps
  └─▶ reasonAboutPrep()      Amazon Bedrock (Claude)      → structured guidance (forced tool-use):
                                { primary_concern, severity, prep_steps[], reasoning }

refine_prep_guidance(session_id, feedback)
  │  "we have no car" / "already did the kit, what's next" — a follow-up in the SAME conversation
  ├─▶ reuses the session's cached location + conditions + alerts (no re-fetching)
  └─▶ reasonAboutPrep()      same reasoning step, told what was already given and the follow-up

remember_preference(session_id, preference)
  │  "elderly resident" — stored once, applied automatically by every later call in that session
```

**Known limitation, stated honestly**: severe weather *alerts* are US-only (NWS doesn't cover
other countries — there's no equivalent free, no-key global alerting API). Outside the US, the
tool still runs and reasons from region + current conditions, but flags `alertsCoverage:
"unsupported"` rather than silently pretending there's no risk.

**Session memory** (`src/lib/session.ts`) is what turns this from a single-turn Q&A bot into a
multi-turn agentic workflow: pass any stable `session_id` (a per-conversation or per-customer id
that Alexa+ would supply) to `get_weather_prep_guidance`, and it's kept alive for
`remember_preference` and `refine_prep_guidance` to build on — standing household details (no
car, elderly or disabled residents, pets, mobility needs) persist across turns without being
restated, and a follow-up like "we already did the kit, what else?" reuses the cached
location/conditions/alerts instead of re-fetching, and builds on guidance already given instead
of repeating it verbatim. It's an in-memory, per-process `Map` — deliberately simple for a
hackathon build; a real deployment would back it with a shared store (Redis/DynamoDB) so it
survives restarts and works across multiple server instances.

## Setup

```bash
npm install
cp .env.example .env   # fill in Google Maps key, NWS_USER_AGENT, AWS credentials/Bedrock API key
npm run dev             # stdio MCP server — for Claude Desktop, MCP Inspector
```

`GOOGLE_MAPS_API_KEY` needs **Geocoding API** enabled in Google Cloud Console.
`NWS_USER_AGENT` should identify your app + contact info (NWS asks for this as a courtesy, not
an API key: `stormwise (your-email@example.com)`).
For Bedrock, either set `AWS_BEARER_TOKEN_BEDROCK` (a Bedrock API key — simplest) or a full IAM
access key pair, and confirm `BEDROCK_MODEL_ID` shows **Access granted** under Bedrock → Model
access (use the full inference profile ARN if your model requires one).

### CLI smoke tests (no UI, fastest way to check the pipeline works)

```bash
npm run smoke:alerts -- "Tucson, AZ"          # geocode + conditions + alerts only, no Bedrock needed
npm run smoke -- "Tucson, AZ"                 # full pipeline, needs Bedrock
npm run demo:alert-impact -- "Tucson, AZ"     # alert-aware vs. alert-blind side-by-side, needs Bedrock
npm run smoke:session -- "Tampa, FL"          # remember_preference → get → refine, needs Bedrock
```

Tip: to find a location with a currently active alert for a compelling demo, check
`https://api.weather.gov/alerts/active?severity=Severe,Extreme` directly — severe weather is
happening somewhere in the US most of the time.

### Real measured performance (`npm run load-test`, real numbers from one run)

15 US regions spanning hurricane/Gulf coast, tornado alley, blizzard-prone north, wildfire-prone
west, and milder regions for contrast — 100% success on every stage:

| Stage | Success | Avg latency |
|---|---|---|
| Geocode | 100% | 246ms |
| Conditions | 100% | 849ms |
| NWS alerts | 100% | 407ms |
| **Bedrock reasoning** | **100%** | **7.2s** |

Bedrock tokens measured (not estimated): ~1183 input / ~362 output → ~$0.009/query at
Sonnet-class Bedrock pricing (verify current rates for your model). 1 of 15 regions had a live
active alert (Phoenix, AZ — Flood Watch) at test time. Re-run `npx tsx scripts/load-test.ts` any
time for fresh numbers — this isn't committed as a static result because conditions and alerts
genuinely change.

## Three ways to see it working

Same validation approach as forecast-fork — three demos, each proving a different layer, all
pointed at the same real running server:

```bash
npm run http   # Streamable HTTP transport at http://localhost:8788/mcp — leave this running
```

### 1. MCP Inspector — protocol-level proof

```bash
npm run inspect
```

Shows all three tools with their real schemas. Fill in `get_weather_prep_guidance`'s `location`
(try a place with an active alert — see the tip above) and a `session_id` (any string), run it,
then call `refine_prep_guidance` with the same `session_id` and some `feedback` — watch the
second result reuse the cached location/conditions/alerts and build on the first guidance instead
of repeating it.

### 2. Web UI — simulated Alexa+ device experience

With `npm run http` running, open **http://localhost:8788/demo/** (Chrome for mic input + spoken
responses). Same Echo-style orb interface as forecast-fork, restyled for the alert domain — a
severity badge (none/minor/moderate/severe/extreme) and a numbered prep-steps card instead of dish
chips. A `session_id` is generated once per page load; a "remember a household detail" field
feeds `remember_preference`, and every guidance card carries quick-feedback chips ("We have no
car", "Already did the kit — what next?") plus a free-text field that call `refine_prep_guidance`
— the multi-turn, context-carrying flow, live in the browser. Calls `POST /api/prep`,
`/api/refine`, and `/api/remember`, which run the exact same `getPrepGuidance()` /
`refinePrepGuidance()` / `rememberPreference()` functions the MCP tools use — real geocoding,
real conditions, real NWS alerts, real Bedrock reasoning.

### 3. alexa-skill-mcp-bridge — real orchestrator, real voice-assistant conversation

Same setup as documented in [forecast-fork's README](../forecast-fork/README.md#3-alexa-skill-mcp-bridge--real-orchestrator-real-voice-assistant-conversation)
— if you already have it cloned and configured from that project, just point `BRIDGE_MCP_URL` at
`http://localhost:8788/mcp` instead (or run both servers on their different ports and switch the
bridge's `.env` between demos). AWS credentials, Nova 2 Lite access, and the bridge clone are all
already set up if you did this for forecast-fork — nothing new to configure.

```bash
# Terminal 1, in this repo
npm run http

# Terminal 2, in the bridge repo
echo "BRIDGE_MCP_URL=http://localhost:8788/mcp" >> .env   # or edit directly
npm run doctor
npm run chat -- --debug
```

Ask something like `how should I prepare right now in Tucson, AZ?` and watch it call
`get_weather_prep_guidance` before answering.

## What it would take to run on real Alexa+ (not done here)

Same gaps as forecast-fork, researched against Amazon's developer docs — see
[forecast-fork's README](../forecast-fork/README.md#what-it-would-take-to-run-on-real-alexa-not-done-here)
for the full writeup (public HTTPS URL, <500ms round-trip latency, OAuth 2.1/PKCE, invite-only
access). The latency gap is somewhat worse here: this project's average Bedrock call (~7.2s) is
even further from the <500ms target, since prep reasoning tends to produce longer, more detailed
output than a dining recommendation.

## What's deliberately not here yet

- **Alexa+ OAuth / PRM auth layer** — same as forecast-fork, left out to keep this buildable fast.
- **Elicitation** for missing required arguments — `location` is required with no fallback prompt.
- **International alert coverage** — NWS is US-only; a global equivalent (e.g. combining multiple
  national meteorological agency APIs, or a paid aggregator) would be the next step for real
  international coverage, not attempted here given no single free global source exists.
- **Bedrock model ID** — defaults to `anthropic.claude-sonnet-4-6-v1:0` in `.env.example`; swap for
  whatever model/inference-profile you have enabled in your AWS account/region.
- **Durable session storage** — `remember_preference`/`refine_prep_guidance` state lives in an
  in-memory `Map` per server process (see `src/lib/session.ts`); fine for a single-process demo,
  but a real deployment needs a shared store so it survives restarts and multiple instances.

## Project structure

```
src/
  server.ts                     shared McpServer instance + tool registration
  index.ts                      stdio entry point (Claude Desktop, MCP Inspector)
  http.ts                       Streamable HTTP entry point + /demo static UI + /api/* routes
  tools/getPrepGuidance.ts      orchestrates geocode → conditions + alerts → reasoning (+ session memory)
  tools/refinePrepGuidance.ts   follow-up turn: reuses cached location/conditions/alerts, avoids repeats
  tools/rememberPreference.ts   stores a standing household detail on a session
  lib/geocode.ts                Google Geocoding API client
  lib/weather.ts                Open-Meteo current-conditions client
  lib/alerts.ts                 US National Weather Service active-alerts client
  lib/bedrock.ts                Bedrock Claude call + reasoning prompt (structured tool-use)
  lib/session.ts                in-memory per-session household details + last-guidance cache
demo/
  index.html                    simulated Alexa+ device UI (orb, voice in/out, chat transcript,
                                 household-detail chips, inline refine-this-guidance controls)
scripts/
  smoke-test.ts                 full pipeline test (needs Bedrock)
  smoke-test-alerts.ts          geocode + conditions + alerts only, no Bedrock needed
  smoke-test-session.ts         remember_preference → get → refine, needs Bedrock
  demo-alert-impact.ts          alert-aware vs. alert-blind side-by-side (needs Bedrock)
  load-test.ts                  real latency/success/token-usage measurement across US regions
```

## License

MIT — see [LICENSE](./LICENSE).

# Stormwise — Devpost submission story

This is the project-story writeup for the Devpost submission form (Inspiration / What it does /
How we built it / Challenges / Accomplishments / What we learned / What's next). Kept as its own
file, separate from [README.md](./README.md)'s setup + technical docs, so it's easy to paste into
the form and easy to keep in sync as the project changes.

## Inspiration

Forecast Fork taught us the shape of a good Alexa+ MCP tool: external real-time data + LLM
reasoning, callable mid-conversation. But dining recommendations are a convenience. We wanted a
second project on the same architecture solving something with actual stakes — a domain where
generic advice isn't just less helpful than specific advice, but can be actively wrong at the
moment it matters most. Severe weather prep was the obvious answer: what you need to do during a
flash flood warning in a desert city, a blizzard warning in the upper Midwest, or a wildfire
red-flag day in California are completely different, and a generic-tips assistant can't tell the
difference.

## What it does

Stormwise is an MCP server exposing three tools Alexa+ can call mid-conversation:

- **`get_weather_prep_guidance`** — give it a location, and it geocodes it, pulls current
  conditions and any **live official alerts from the US National Weather Service**, then asks
  Claude (on Amazon Bedrock) to reason about what to actually do — specific, regionally-calibrated
  prep steps with a severity rating, not a generic "have a kit ready" checklist. Outside the US,
  where NWS doesn't have coverage, it says so honestly rather than pretending there's no risk.
- **`remember_preference`** — stores a standing household detail ("no car", "elderly resident",
  "two dogs") against a `session_id`, so it's applied automatically to every guidance call in that
  conversation instead of the customer repeating it.
- **`refine_prep_guidance`** — a follow-up turn ("we already did the kit, what's next?", "we have
  no car") that reuses the session's cached location, conditions, and alerts (no re-fetching) and
  builds on the guidance already given instead of repeating it.

That last pair turns this from a single-turn Q&A bot into a multi-turn conversation — a customer
states a constraint like "no car" once, and every later call, including follow-ups, reasons with
that constraint already in mind.

## How we built it

The core pipeline: geocode (Google Geocoding API) → current conditions (Open-Meteo, no key) and
active alerts (NWS, no key, just a courtesy `User-Agent` header) in parallel → Claude on Bedrock
with forced tool-use, returning structured guidance (`primary_concern`, `severity`, `prep_steps[]`,
`reasoning`).

Session memory sits alongside that pipeline as a small in-memory store keyed by `session_id`:
`get_weather_prep_guidance` writes the location/conditions/alerts/steps it just produced (and any
remembered household details it applied), and `refine_prep_guidance` reads that back so it can
reason again without repeating an API call or repeating advice already given.

Same three-path validation as Forecast Fork — MCP Inspector for protocol proof (now also showing
`refine_prep_guidance` carrying session state across calls), a restyled Echo-style web UI with a
severity-badge/prep-steps card plus a "remember a household detail" field and per-guidance refine
chips, and `alexa-skill-mcp-bridge` for a real orchestrator conversation. We also built a
comparison mode: the same location reasoned about with live alert data versus an "alert-blind"
baseline (season and conditions only, roughly what a static tips page would produce).

## Challenges we ran into

**The comparison mode surfaced something we didn't expect.** Testing Tucson, AZ during an actual
live Flash Flood Warning, the alert-blind baseline didn't just sound vaguer — it stated as fact
that there were no active alerts, when there were two. That's not a quality gap, it's a factual
error, and it reshaped how central that comparison became to the whole pitch.

**No free, global severe-weather-alert API exists.** NWS is excellent but US-only. Rather than
fake international coverage, we built an explicit `"unsupported"` state and documented the gap
honestly instead of glossing over it.

**The latency problem is worse here than in Forecast Fork.** Prep guidance tends to be more
detailed than a dining suggestion, so our average Bedrock call runs 7.2 seconds against Alexa+'s
<500ms target — a gap we chose to document rather than hide.

## Accomplishments that we're proud of

- **A concrete, real proof that live data changes correctness, not just quality** — the
  alert-blind baseline's false "no active alerts" claim, caught during an actual live warning, not
  staged.
- **100% success across 15 US regions** spanning hurricane coastlines, tornado alley, blizzard
  country, and wildfire terrain — real load-test data with measured token costs: ~1183 input /
  ~362 output tokens per call, working out to roughly $0.009/query at Sonnet-class Bedrock pricing.
- **Built and validated against a real, live severe weather event** (Tucson's Flash Flood
  Warning), rather than only synthetic test cases.
- **Personalization and multi-turn refinement, not just single-shot answers**: `remember_preference`
  and `refine_prep_guidance` let a customer state a household constraint once and react to
  guidance naturally ("what about our pets?") without repeating themselves or restarting the
  conversation.
- **Reused a proven architecture responsibly** — same rigor (three validation paths, real load
  testing, honest limitations) as our first project, not a lower-effort copy.

## What we learned

Domain choice matters as much as architecture. The exact same technical pattern — geocode, pull
live data, reason with an LLM — produces a far more compelling story when the live data genuinely
changes correctness rather than just specificity. We learned to run baseline comparisons against
real conditions, not assumed ones — the "no active alerts" hallucination was only visible because
we happened to test during an actual live warning. And carrying the session-memory pattern over
from Forecast Fork confirmed it wasn't a one-off trick: the same `session_id` mechanism that made
dining follow-ups feel natural did the same for prep guidance, which suggests it's a reusable
building block for any Alexa+ MCP tool, not something specific to one domain.

## What's next for Stormwise

- **International alert coverage** — aggregating multiple national meteorological agency APIs to
  close the US-only gap.
- **Elicitation and the OAuth 2.1/PRM auth layer** — the same gaps as Forecast Fork, not yet closed
  here either.
- **A proactive mode** — alerting an Alexa+ household when a new severe warning is issued for their
  area, not only answering on request, which fits the safety domain better than a purely reactive
  assistant.
- **Multi-hazard expansion** — air quality and extreme heat advisories alongside NWS's
  storm/flood/wind alerts.
- **Durable session storage** — today's session memory is an in-memory `Map` per server process;
  moving it to a shared store (Redis/DynamoDB) would let it survive restarts and scale across
  multiple instances, which matters more here than for a dining app, since a household's prep
  context is exactly what you don't want to lose mid-emergency.
- **Faster response** — given this project's latency gap (~7.2s vs. Alexa+'s <500ms target) is the
  largest of anything we've built so far.

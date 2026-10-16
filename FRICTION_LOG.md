# Friction log — building stormwise on AWS

Real friction encountered while building stormwise for the Alexa+ track, captured as we hit it
rather than reconstructed afterward. Shared as direct feedback to the Amazon teams building these
tools, not as a complaint about the project — stormwise works, and these are the specific points
where the path to "working" was harder or less obvious than it needed to be. Two of these
(1 and 2) also appear in forecast-fork's friction log — logged again here deliberately, because
hitting the same root cause independently on a second, unrelated project is itself a useful
signal that these aren't one-off mistakes.

---

## 1. Bedrock model invocation — invalid identifier, then inference-profile requirement

- **Task attempted:** Call a Claude model on Amazon Bedrock via `InvokeModelCommand`
  (`@aws-sdk/client-bedrock-runtime`).
- **Steps taken:** Set `BEDROCK_MODEL_ID` to a plain model ID copied from Bedrock's model
  catalog page in the console.
- **Expected result:** Successful invocation.
- **Actual result:** Failed outright with an invalid-identifier-style error. After correcting
  that, a second failure: the specific Claude model needed requires the full inference-profile
  ARN, not a base model ID.
- **Severity:** Moderate — blocked the first run.
- **Workaround used:** Used the full inference-profile ARN as `BEDROCK_MODEL_ID`, matching
  `AWS_REGION` to the region embedded in the ARN — same fix as forecast-fork, confirming this
  is a systemic Bedrock UX gap rather than something specific to one project's configuration.
- **Actionable suggestion:** Same as forecast-fork's — have `InvokeModel` say explicitly "this
  model requires an inference profile ARN" instead of a generic invocation failure, and flag
  inference-profile-only models directly in the console's model catalog.

## 2. Bedrock API key vs. full IAM credentials — not interchangeable

- **Task attempted:** Run `alexa-skill-mcp-bridge`'s health check (`npm run doctor`) against
  stormwise, pointed at a new `BRIDGE_MCP_URL`.
- **Steps taken:** Reused the project's `AWS_BEARER_TOKEN_BEDROCK` (Bedrock API key) as the
  bridge's AWS credential, same as had worked for the server itself.
- **Expected result:** Health check passes.
- **Actual result:** Failed — the bridge's doctor check calls AWS STS (`GetCallerIdentity`)
  directly, which a Bedrock-scoped bearer token doesn't satisfy.
- **Severity:** Moderate — required provisioning IAM infrastructure specifically for this,
  again, on a second project.
- **Workaround used:** Reused the IAM user created for forecast-fork's bridge testing (same
  scoped inline policy: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`) — the
  one piece of this that got easier the second time, since the credential was already
  provisioned.
- **Actionable suggestion:** Same as forecast-fork's — document explicitly, wherever Bedrock
  API keys are introduced, that they satisfy Bedrock Runtime calls only.

## 3. Reasoning latency is worse here than in a comparable project

- **Task attempted:** Validate the full pipeline (geocode → conditions/alerts → Bedrock
  reasoning) against the bridge's simulated Alexa response deadline (~6.5s).
- **Steps taken:** Ran real queries end-to-end and measured wall-clock time per stage across
  15 US regions (see `scripts/load-test.ts`).
- **Expected result:** Latency comparable to forecast-fork's dining-recommendation pipeline
  (6.2s average), since the architecture is nearly identical.
- **Actual result:** Measurably worse — 7.2s average. Prep guidance produces longer, more
  detailed structured output (more prep steps, more context per step) than a dining
  recommendation, and that extra output length directly costs extra generation time.
- **Severity:** Critical for production readiness in this specific domain — severe weather
  prep is more time-sensitive than a dining suggestion, so the latency gap matters more here
  than the raw seconds alone suggest.
- **Workaround used:** None — documented as a known, honest limitation.
- **Actionable suggestion:** Beyond forecast-fork's general ask (a faster/streaming inference
  mode for voice-assistant budgets), a way to cap or guide *output length* at the API level
  (not just `max_tokens` as a hard cutoff, but something that trades off completeness for
  speed when the caller signals a latency-sensitive context) would directly help
  safety-relevant, time-sensitive use cases like this one.

## 4. AWS Budgets is alert-only, not a hard spend cap

- **Task attempted:** Figure out how to protect against runaway Bedrock spend if this server
  were ever made publicly reachable (e.g. for judging), given usage for a severe-weather app
  is naturally spiky and correlated with real events.
- **Steps taken:** Looked for a way to hard-cap Bedrock spend at a threshold directly in AWS.
- **Expected result:** A budget or quota mechanism that stops further Bedrock calls once a
  spend threshold is hit.
- **Actual result:** AWS Budgets only sends an alert after a threshold is crossed — there's no
  native way to have it automatically deny further Bedrock calls without building custom
  automation (e.g. a Budget Action wired to an IAM policy change via Lambda/SNS).
- **Severity:** Moderate — not a blocker for this project (we added application-level rate
  limiting in forecast-fork as the practical mitigation instead), but a real gap for anyone
  relying on AWS-native tools alone.
- **Workaround used:** Application-level rate limiting (per-IP and global daily caps) as the
  actual enforcement layer, with AWS Budgets kept as a secondary, alert-only safety net.
- **Actionable suggestion:** A first-class "hard stop at $X" budget action for Bedrock
  specifically (not a general-purpose Lambda automation builders have to wire up themselves)
  would materially lower the barrier to safely exposing a Bedrock-backed demo publicly —
  exactly the kind of thing a hackathon participant needs and currently has to build by hand.

## 5. Alexa+ developer access — invite-only, no public queue

- **Task attempted:** Get real Alexa+ access to validate stormwise against the actual
  assistant, not just a simulation.
- **Steps taken:** Checked developer.amazon.com for an Alexa+ for Builders signup or waitlist.
- **Expected result:** A public signup flow or waitlist.
- **Actual result:** Alexa+ for Builders is "currently available to select partners working
  directly with our team" — no public queue.
- **Severity:** Critical for true end-to-end validation; reshaped the validation strategy for
  this project the same way it did for forecast-fork.
- **Workaround used:** The same three-path validation approach: MCP Inspector, a simulated
  Alexa+-style web UI, and `alexa-skill-mcp-bridge` (Strands agent on Bedrock AgentCore with
  Amazon Nova) as a real orchestrator stand-in.
- **Actionable suggestion:** Same as forecast-fork's — a hackathon-scoped sandbox tier for
  Alexa+ access would let teams validate against the real assistant instead of only
  approximating it.

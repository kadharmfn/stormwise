import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { getPrepGuidance } from "./tools/getPrepGuidance.js";
import { refinePrepGuidance } from "./tools/refinePrepGuidance.js";
import { rememberPreference } from "./tools/rememberPreference.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// Demo UI — local-only visual front end for the same tool logic the MCP server exposes.
app.use("/demo", express.static(path.join(__dirname, "..", "demo")));

app.post("/api/prep", async (req, res) => {
  try {
    const { location, context, session_id } = req.body as {
      location?: string;
      context?: string;
      session_id?: string;
    };
    if (!location) {
      res.status(400).json({ error: "location is required" });
      return;
    }
    const result = await getPrepGuidance({ location, context, sessionId: session_id });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/refine", async (req, res) => {
  try {
    const { session_id, feedback } = req.body as { session_id?: string; feedback?: string };
    if (!session_id || !feedback) {
      res.status(400).json({ error: "session_id and feedback are required" });
      return;
    }
    const result = await refinePrepGuidance({ sessionId: session_id, feedback });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/remember", (req, res) => {
  const { session_id, preference } = req.body as { session_id?: string; preference?: string };
  if (!session_id || !preference) {
    res.status(400).json({ error: "session_id and preference are required" });
    return;
  }
  const result = rememberPreference({ sessionId: session_id, preference });
  res.json(result);
});

// Stateless mode: each request gets its own server + transport pair.
app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const methodNotAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless mode." },
    id: null,
  });
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

const port = Number(process.env.PORT ?? 8788);
app.listen(port, () => {
  console.log(`stormwise MCP server (Streamable HTTP) listening at http://localhost:${port}/mcp`);
});

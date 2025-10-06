import express from "express";
import { google } from "googleapis";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  PORT = 8080,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error("❌ Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN");
  process.exit(1);
}

// ✅ Google OAuth setup
const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
const docs = google.docs({ version: "v1", auth: oauth2Client });

const app = express();
app.use(express.json());

// Store transports by session ID
const transports = {};

// ✅ OAuth configuration endpoint - ChatGPT checks this first
app.get("/", (req, res) => {
  res.json({
    name: "google-docs-writer",
    version: "1.0.0",
    authentication: {
      type: "oauth",
      authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      client_id: GOOGLE_CLIENT_ID,
      scopes: [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive.file",
      ],
    },
  });
});

// Create MCP server instance (reusable function)
const createServer = () => {
  const mcp = new Server(
    { name: "google-docs-writer", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // Register tool handlers
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "append_text_to_doc",
          description: "Append text to a Google Doc",
          inputSchema: {
            type: "object",
            properties: {
              docId: { type: "string", description: "The Google Doc ID" },
              content: { type: "string", description: "The text to append" },
            },
            required: ["docId", "content"],
          },
        },
      ],
    }));

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "append_text_to_doc") {
      const { docId, content } = request.params.arguments;

      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              insertText: {
                text: content,
                endOfSegmentLocation: {},
              },
            },
          ],
        },
      });

      return {
        content: [
          {
            type: "text",
            text: "✅ Text appended successfully to document.",
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return mcp;
};

// ✅ SSE endpoint - establishes the stream
app.get("/sse", async (req, res) => {
  console.log("📡 Establishing SSE connection");

  try {
    // Create transport with POST endpoint
    const transport = new SSEServerTransport("/messages", res);
    const sessionId = transport.sessionId;

    // Store transport
    transports[sessionId] = transport;

    // Cleanup on close
    transport.onclose = () => {
      console.log(`🔌 SSE closed for session ${sessionId}`);
      delete transports[sessionId];
    };

    // Create server and connect
    const mcp = createServer();
    await mcp.connect(transport);
    console.log(`✅ SSE established with session: ${sessionId}`);

  } catch (error) {
    console.error("❌ Error establishing SSE:", error);
    if (!res.headersSent) {
      res.status(500).send("Error establishing SSE stream");
    }
  }
});

// ✅ POST endpoint - receives client messages
app.post("/messages", async (req, res) => {
  console.log("📨 Received message");

  const sessionId = req.query.sessionId;

  if (!sessionId) {
    console.error("❌ No sessionId in request");
    res.status(400).send("Missing sessionId parameter");
    return;
  }

  const transport = transports[sessionId];

  if (!transport) {
    console.error(`❌ No transport for session: ${sessionId}`);
    res.status(404).send("Session not found");
    return;
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error("❌ Error handling message:", error);
    if (!res.headersSent) {
      res.status(500).send("Error handling request");
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Proxy running on http://localhost:${PORT}/sse`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing session ${sessionId}:`, error);
    }
  }
  process.exit(0);
});

import express from "express";
import { google } from "googleapis";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

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

// ✅ Health check & OAuth configuration - ChatGPT checks root endpoint
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

// ✅ SSE endpoint for the actual MCP connection
app.get("/sse", async (req, res) => {
  const mcp = new Server(
    { name: "google-docs-writer", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // Define tool handlers
  mcp.setRequestHandler("tools/list", async () => ({
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

  mcp.setRequestHandler("tools/call", async (request) => {
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

  const transport = new SSEServerTransport({ res });
  await mcp.connect(transport);
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Proxy running on http://localhost:${PORT}/sse`);
});


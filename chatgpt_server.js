import express from "express";
import { google } from "googleapis";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  PORT = 8080, // ✅ Railway uses dynamic port, default to 8080
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error("❌ Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN");
  process.exit(1);
}

// ✅ Google OAuth setup
const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
const docs = google.docs({ version: "v1", auth: oauth2Client });

// ✅ Express setup
const app = express();

// Health check route
app.get("/", (req, res) => {
  res.send("✅ MCP Proxy is running and ready!");
});

// ✅ SSE endpoint for ChatGPT MCP
app.get("/sse", (req, res) => {
  const mcp = new Server(
    { name: "google-docs-writer", version: "1.0.0" },
    {
      capabilities: {
        authentication: {
          methods: ["oauth"], // ✅ This signals OAuth support
        },
        tools: {
          append_text_to_doc: {
            description: "Append text to a Google Doc",
            inputSchema: {
              type: "object",
              properties: {
                docId: { type: "string", description: "The Google Doc ID" },
                content: { type: "string", description: "The text to append" },
              },
              required: ["docId", "content"],
            },
            async execute({ docId, content }) {
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
              return { ok: true, message: "✅ Text appended successfully." };
            },
          },
        },
      },
    }
  );

  // ✅ Properly connect the SSE transport to Express
  const transport = new SSEServerTransport({ req, res });
  mcp.connect(transport);
});

// ✅ Start the server
app.listen(PORT, () => {
  console.log(`🚀 MCP Proxy running on http://localhost:${PORT}/sse`);
});


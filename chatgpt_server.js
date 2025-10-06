import express from "express";
import { google } from "googleapis";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// ✅ Env vars
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, PORT = 3000 } = process.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error("❌ Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN");
  process.exit(1);
}

// ✅ Google OAuth setup
const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
const docs = google.docs({ version: "v1", auth: oauth2Client });

// ✅ Create MCP server
const mcp = new Server(
  { name: "google-docs-writer", version: "1.0.0" },
  {
    capabilities: {
      tools: {
        append_text_to_doc: {
          description: "Append text to a Google Doc",
          inputSchema: {
            type: "object",
            properties: {
              docId: { type: "string", description: "The Google Doc ID" },
              content: { type: "string", description: "The text to append" }
            },
            required: ["docId", "content"]
          },
          handler: async ({ docId, content }) => {
            try {
              console.log(`📝 Appending text to document ${docId}...`);
              await docs.documents.batchUpdate({
                documentId: docId,
                requestBody: {
                  requests: [
                    {
                      insertText: {
                        text: `\n${content}\n`,
                        endOfSegmentLocation: {}
                      }
                    }
                  ]
                }
              });
              console.log("✅ Successfully appended text!");
              return {
                content: [
                  {
                    type: "text",
                    text: `✅ Successfully appended text to Google Doc: ${docId}`
                  }
                ]
              };
            } catch (err) {
              console.error("❌ Error appending text:", err.message);
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Failed to append text: ${err.message}`
                  }
                ]
              };
            }
          }
        }
      }
    }
  }
);

// ✅ Express app + attach transport as middleware
const app = express();
const transport = new SSEServerTransport({ path: "/sse" });

// ⚠️ IMPORTANT: register transport route manually to avoid writeHead errors
app.get("/sse", (req, res) => {
  transport.handle(req, res, mcp);
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 MCP Proxy running on http://localhost:${PORT}/sse`);
  console.log("📎 Paste this URL into ChatGPT Custom Connector MCP Server URL.");
});


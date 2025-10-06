const mcp = new Server(
  { name: "google-docs-writer", version: "1.0.0" },
  {
    capabilities: {
      authentication: {
        methods: ["oauth"], // ✅ Tells ChatGPT OAuth is supported
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


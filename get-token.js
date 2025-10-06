import { google } from "googleapis";
import open from "open";
import readline from "readline";

const CLIENT_ID = "409501940632-lkjko05u0c2und4ddi1dniaf0nc9p5o5.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = "http://localhost:3000"; // same as you added

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// 1. Ask user to visit this URL
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
  ],
});

console.log("Authorize this app by visiting this URL:\n", authUrl);
await open(authUrl);

// 2. Wait for the code from the user
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("\nPaste the code from the URL here: ", async (code) => {
  const { tokens } = await oAuth2Client.getToken(code);
  console.log("\n✅ Your refresh token is:\n", tokens.refresh_token);
  rl.close();
});


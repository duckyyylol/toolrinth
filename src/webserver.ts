import express from "express";
import { apiClient, getApiClient, logger } from ".";

const app = express();

app.use(express.json());

const webUrl = process.env.WEB_URL;

function authFailUrl(message: string): string {
  return `${webUrl}/auth/failure?e=${encodeURIComponent(message)}`;
}

function authSuccessUrl(): string {
  return `${webUrl}/auth/success`;
}

app.get("/:guildId/:userId", async (req, res) => {
  const guildId = req.query?.guildId as string;
  const userId = req.query?.userId as string;

  if (!guildId || !userId) return res.redirect(authFailUrl("Malformed URL. Missing User or Guild ID"))

  const code = req.query?.code;
  const existingToken = req.cookies?.["token"];
  const apiClient = getApiClient(guildId);

  if (existingToken) {
    const tokenUser = await apiClient.Users().getAuthorizedUser();

  }
});

export function start() {
  app.listen(process.env.PORT, (e) => {
    if (e) {

    } else {
      logger.info(`Webserver listening on port ${process.env.PORT}`)
    }
  })
}

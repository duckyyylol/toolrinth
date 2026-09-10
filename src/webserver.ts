import express from "express";
import { apiClient, dev_mode, emitter, getApiClient, logger, mockNotifications, notificationRelayTick, oauth } from ".";
import config from "./constants";
import { OAuth2, User, UserNotification } from "@toolrinth/lib";
import { DB } from "./db/DB";
import { ContextTypes, RinthEvents } from "./types";
import cors from "cors";

const app = express();

app.use(express.json());
app.use(cors());

const webUrl = dev_mode ? "https://dev.ducky.wiki" : config.web_url;

const contexts: Map<string, { contextId: string; userId: string; }> = new Map(); // state id, {context id, user id}


function authFailUrl(message: string, from: string): string {
  return `${webUrl}/auth/failure?e=${encodeURIComponent(message)}&f=${encodeURIComponent(from)}`;
}

function authSuccessUrl(user: User): string {
  return `${webUrl}/auth/success?u=${user.username}&a=${user.avatar_url}`;
}

function loginUrl(redirectUrl: string, contextId: string, userId: string, state: string): string {
  return `${webUrl}/auth/login?s=${state}&c=${contextId}&u=${userId}&r=${encodeURIComponent(redirectUrl)}`
}

app.get("/", async (req, res) => {
  const code = req.query?.code as string | null;
  const state = req.query?.state as string | null;
  const from = req.get('host') + req.originalUrl;

  if (code) {
    if(!state) return res.redirect(authFailUrl("Missing State", from));
    if (!contexts.has(state)) return res.redirect(authFailUrl("Invalid State", from));

    const context = contexts.get(state);

    const {data: token, error} = await oauth.exchangeCode(code);
    if (error) return res.redirect(authFailUrl(`${error.status} ${error.message}`, from));

    const { data: tokenUser, error: userError } = await oauth.getUserFromToken(token.access_token)
    if (userError) return res.redirect(authFailUrl(`${userError.status} ${userError.message}`, from));

    res.cookie("token", token.access_token, { path: "/" });

    const type = (context.contextId === context.userId) ? ContextTypes.USER : ContextTypes.GUILD;
    const dbContext = DB.Contexts.getContext(context.contextId) || DB.Contexts.createContext({ id: context.contextId, authorized: true, authorized_user_id: context.userId, token: token.access_token, type });

    DB.Auth.updateAuth(context.contextId, context.userId, token.access_token, token.expires_in);
    emitter.emit(RinthEvents.USER_AUTHORIZE, context.contextId, context.userId, tokenUser);

    res.redirect(authSuccessUrl(tokenUser));
  }
  else res.send(webUrl)
})

app.get("/:contextId/:userId", async (req, res) => {
  const contextId = req.params.contextId as string;
  const userId = req.params.userId as string;
  const from = req.get('host') + req.originalUrl;

  if (!contextId || !userId) return res.redirect(authFailUrl("Malformed URL. Missing User or Context ID", from))

  const code = req.query?.code as string | null;
  const existingToken = req.cookies?.["token"];
  const apiClient = getApiClient(contextId);

  if (existingToken) {
    const tokenUser = await apiClient.Users().getAuthorizedUser();

  } else {
    if (!code) {
      const redirectUrl = oauth.getRedirectUrl();
      contexts.set(redirectUrl.state, { contextId, userId });

      res.redirect(loginUrl(redirectUrl.redirect_url, contextId, userId, redirectUrl.state));
    }
  }
});

app.post("/test/notifications/:userId", async (req, res) => {
  if (!dev_mode) return res.status(404).send("Not Available");

  const userId = req.params.userId;
  const notifications = req.body as UserNotification[];

  console.log("MOCK NOTIFS", notifications)

  mockNotifications.set(userId, notifications);
  await notificationRelayTick();
  res.send({message: `Set ${notifications.length} mock notifications for user ${userId}`})
})

export function start() {
  app.listen(process.env.PORT, (e) => {
    if (e) {

    } else {
      logger.info(`Webserver listening on port ${process.env.PORT}`)
    }
  })
}

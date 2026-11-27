const crypto = require("node:crypto");
const config = process.env;
const bucket = "trust-media-staging";
const scopes = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly"
];
const providerScopes = { drive: [scopes[0]], youtube: [scopes[1]], analytics: [scopes[2]] };
const connectionKey = row => row.owner_id + ":" + row.provider;
const uploadProvider = kind => {
  if (["drive-photo", "drive-video"].includes(kind)) return "drive";
  if (["youtube-video", "youtube-thumbnail"].includes(kind)) return "youtube";
  throw new PublicError("Choose a supported upload destination.");
};
const trustChannelId = () => config.GOOGLE_YOUTUBE_CHANNEL_ID || "UCArUc8vHzOs3uQyhDwbl5eA";
const uuid = () => crypto.randomUUID();
const nonce = () => crypto.randomBytes(32).toString("base64url");
const digest = value => crypto.createHash("sha256").update(value).digest("base64url");
class PublicError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function required(name) {
  if (!config[name]) throw new PublicError("Server configuration missing: " + name, 503);
  return config[name];
}
function key() {
  const value = required("MEDIA_TOKEN_ENCRYPTION_KEY");
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new PublicError("Media encryption key must be 32 bytes in hex.", 503);
  return Buffer.from(value, "hex");
}
function seal(value, context) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(chunk => chunk.toString("base64url")).join(".");
}
function unseal(value, context) {
  const [iv, tag, data] = value.split(".").map(chunk => Buffer.from(chunk, "base64url"));
  const cipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
async function json(url, options = {}, service = "Service") {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(25000) });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = value?.error?.errors?.[0]?.reason || (typeof value?.error === "string" && value.error);
    const code = typeof reason === "string" && /^[a-zA-Z0-9_-]{1,60}$/.test(reason) ? " (" + reason + ")" : "";
    throw new PublicError(service + " returned HTTP " + response.status + code + ".", response.status === 429 ? 429 : 502);
  }
  return value;
}
const sb = () => required("SUPABASE_URL").replace(/\/$/, "");
function serviceHeaders() {
  const token = required("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: token, Authorization: "Bearer " + token };
}
async function db(table, query = "", method = "GET", body, prefer = "return=representation") {
  return json(sb() + "/rest/v1/" + table + query, {
    method, headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: prefer },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }, "Media database");
}
async function admin(req) {
  const authorization = req.headers.authorization || "";
  if (!/^Bearer [\w.-]+$/.test(authorization)) throw new PublicError("Sign in to Trust Portal first.", 401);
  const headers = { apikey: required("SUPABASE_ANON_KEY"), Authorization: authorization, "Content-Type": "application/json" };
  const who = await fetch(sb() + "/auth/v1/user", { headers, signal: AbortSignal.timeout(10000) });
  if (!who.ok) throw new PublicError("Admin session expired. Sign in again.", 401);
  const user = await who.json();
  await verifyAdminId(user.id);
  return user.id;
}
async function verifyAdminId(id) {
  if (await db("rpc/media_is_admin", "", "POST", { candidate: id }) !== true) throw new PublicError("Admin access is required.", 403);
}
function connections(owner) {
  return db("media_google_provider_connections", "?owner_id=eq." + owner);
}
async function connection(owner, provider) {
  return (await db("media_google_provider_connections", "?owner_id=eq." + owner + "&provider=eq." + provider))[0];
}
function google(url, token, method = "GET", body) {
  return json(url, { method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, "Google API");
}
function tokenRequest(payload) {
  return json("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: required("GOOGLE_CLIENT_ID"), client_secret: required("GOOGLE_CLIENT_SECRET"), ...payload })
  }, "Google OAuth");
}
const tokenCache = new Map();
async function access(row) {
  if (!row) throw new PublicError("Connect a Google account first.", 409);
  const cacheKey = connectionKey(row);
  const cached = tokenCache.get(cacheKey);
  if (cached?.version === row.updated_at && cached.until > Date.now()) return cached.token;
  const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: unseal(row.encrypted_refresh, cacheKey) });
  tokenCache.set(cacheKey, { version: row.updated_at, token: refreshed.access_token, until: Date.now() + (refreshed.expires_in - 60) * 1000 });
  if (tokenCache.size > 100) tokenCache.delete(tokenCache.keys().next().value);
  return refreshed.access_token;
}
const drive = "https://www.googleapis.com/drive/v3";
const youtube = "https://www.googleapis.com/youtube/v3";
function googleQuery(url, params, token) {
  return google(url + "?" + new URLSearchParams(params), token);
}
async function channel(token) {
  const data = await googleQuery(youtube + "/channels", { part: "id,snippet", mine: "true", maxResults: "50" }, token);
  const expected = trustChannelId();
  return data.items?.find(item => item.id === expected) || null;
}
async function folder(token) {
  const id = required("GOOGLE_DRIVE_FOLDER_ID");
  const item = await googleQuery(drive + "/files/" + encodeURIComponent(id), {
    fields: "id,name,mimeType,trashed,webViewLink,capabilities(canAddChildren)", supportsAllDrives: "true"
  }, token).catch(error => {
    if (/HTTP (403|404)/.test(error.message)) {
      throw new PublicError("Drive signed in, but the app cannot access the configured folder. Check GOOGLE_DRIVE_FOLDER_ID and grant this OAuth app access to that folder via Google Picker, or use a folder created by this app.", 409);
    }
    throw error;
  });
  if (item.trashed || item.mimeType !== "application/vnd.google-apps.folder" || !item.capabilities?.canAddChildren)
    throw new PublicError("The configured Drive folder is unavailable or cannot accept uploads.", 409);
  return { id: item.id, name: item.name, url: item.webViewLink || "https://drive.google.com/drive/folders/" + item.id };
}
async function audit(owner, action, details = {}) {
  await db("media_activity_events", "", "POST", { owner_id: owner, action, details }, "return=minimal");
}
module.exports = { config, bucket, uuid, nonce, digest, PublicError, required, seal, unseal, json, sb, serviceHeaders, db, admin, verifyAdminId, connections, connection, connectionKey, uploadProvider, providerScopes, trustChannelId, access, tokenRequest, google, googleQuery, folder, channel, drive, youtube, audit, tokenCache };

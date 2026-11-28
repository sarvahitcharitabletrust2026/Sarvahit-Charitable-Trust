const m = require("../../server/google-media.cjs");
const { config, db, google, googleQuery, drive, youtube, PublicError } = m;
const callbackPath = "/api/google/callback";
function callbackUrl() {
  const url = new URL(m.required("GOOGLE_REDIRECT_URI"));
  if (url.protocol !== "https:" || url.pathname !== callbackPath || url.search || url.hash || url.username || url.password)
    throw new PublicError("Configure an HTTPS GOOGLE_REDIRECT_URI ending in " + callbackPath + ".", 503);
  return url;
}
function cookie(state, value, age) {
  return "__Secure-media_oauth_" + state + "=" + value + "; Path=" + callbackPath + "; Max-Age=" + age + "; HttpOnly; Secure; SameSite=Lax";
}
async function assertUploadsIdle(owner, provider) {
  const kinds = provider === "drive" ? "&request->>kind=in.(drive-photo,drive-video)"
    : provider === "youtube" ? "&request->>kind=in.(youtube-video,youtube-thumbnail)" : "";
  if (provider === "analytics") return;
  const scope = "?owner_id=eq." + owner + kinds;
  const staleBefore = encodeURIComponent(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString());
  await db("media_upload_jobs", scope + "&status=eq.processing&updated_at=lt." + staleBefore, "PATCH", {
    status: "review", stage: "Check destination",
    error: "The worker stopped reporting progress. Check Google before uploading this file again.",
    updated_at: new Date().toISOString()
  });
  const [job] = await db("media_upload_jobs", scope + "&status=in.(queued,processing)&select=status&order=status.asc&limit=1");
  if (job) throw new PublicError(job.status === "queued"
    ? "An upload is queued. Open Upload Jobs & Activity and cancel the queued upload, or wait for the media worker to finish."
    : "An upload is still processing for this connection. Check its progress in Upload Jobs & Activity.", 409);
}
async function start(owner, provider, res) {
  if (!Object.hasOwn(m.providerScopes, provider)) throw new PublicError("Select a Google connection type.");
  const scopes = ["openid", "email", ...m.providerScopes[provider]];
  await assertUploadsIdle(owner, provider);
  const state = m.nonce();
  const browser = m.nonce();
  const verifier = m.nonce();
  const redirect = callbackUrl();
  await db("media_oauth_states", "?expires_at=lt." + encodeURIComponent(new Date().toISOString()), "DELETE");
  await db("media_oauth_states", "", "POST", {
    state_hash: m.digest(state), browser_hash: m.digest(browser), owner_id: owner,
    verifier: m.seal(JSON.stringify({ provider, verifier }), state), expires_at: new Date(Date.now() + 600000).toISOString()
  });
  res.setHeader("Set-Cookie", cookie(state, browser, 600));
  const query = new URLSearchParams({
    client_id: m.required("GOOGLE_CLIENT_ID"), redirect_uri: redirect.href, response_type: "code",
    scope: scopes.join(" "), include_granted_scopes: "false", state, code_challenge: m.digest(verifier),
    code_challenge_method: "S256", access_type: "offline", prompt: "consent select_account"
  });
  return { url: "https://accounts.google.com/o/oauth2/v2/auth?" + query };
}
async function callback(req, res) {
  const redirect = callbackUrl();
  const query = new URL(req.url, redirect.origin).searchParams;
  const state = query.get("state");
  if (!/^[\w-]{43}$/.test(state || "")) throw new PublicError("Invalid OAuth state.");
  const name = "__Secure-media_oauth_" + state;
  const browser = (req.headers.cookie || "").split(/;\s*/).find(x => x.startsWith(name + "="))?.slice(name.length + 1);
  if (!browser) throw new PublicError("OAuth browser session expired. Start again from Media Studio.");
  const rows = await db("media_oauth_states", "?state_hash=eq." + m.digest(state) +
    "&browser_hash=eq." + m.digest(browser) + "&expires_at=gt." + encodeURIComponent(new Date().toISOString()), "DELETE");
  res.setHeader("Set-Cookie", cookie(state, "", 0));
  const entry = rows[0];
  if (!entry) throw new PublicError("OAuth state expired or was already used.");
  if (query.has("error") || !query.get("code")) throw new PublicError("Google authorization was cancelled or denied.");
  await m.verifyAdminId(entry.owner_id);
  const { provider, verifier } = JSON.parse(m.unseal(entry.verifier, state));
  if (!Object.hasOwn(m.providerScopes, provider)) throw new PublicError("Invalid OAuth connection type.");
  const tokens = await m.tokenRequest({
    grant_type: "authorization_code", code: query.get("code"),
    redirect_uri: redirect.href, code_verifier: verifier
  });
  const granted = String(tokens.scope || "").split(/\s+/);
  if (m.providerScopes[provider].some(scope => !granted.includes(scope)) || !tokens.refresh_token)
    throw new PublicError("Google did not grant the requested permissions and offline access. Reconnect and approve all permissions.", 403);
  const profile = await google("https://openidconnect.googleapis.com/v1/userinfo", tokens.access_token);
  if (!profile.email || !profile.email_verified) throw new PublicError("Google did not return a verified account email.", 403);
  const linked = provider === "youtube" ? await m.channel(tokens.access_token) : null;
  if (provider === "youtube" && !linked) throw new PublicError("Select the configured Trust YouTube channel.", 403);
  if (provider === "analytics") await analytics(tokens.access_token);
  await assertUploadsIdle(entry.owner_id, provider);
  await db("media_google_provider_connections", "?on_conflict=owner_id,provider", "POST", {
    owner_id: entry.owner_id, provider, email: profile.email,
    encrypted_refresh: m.seal(tokens.refresh_token, m.connectionKey({ owner_id: entry.owner_id, provider })),
    channel_id: linked?.id || null, channel_name: linked?.snippet?.title || null,
    scopes: granted, updated_at: new Date().toISOString()
  }, "resolution=merge-duplicates,return=minimal");
  await m.audit(entry.owner_id, "google_connected", { provider });
  res.setHeader("Location", redirect.origin + "/admin.html?mediaOAuth=connected#media-social-panel");
  res.status(303).end();
}
async function analytics(token) {
  const end = new Date(Date.now() - 2 * 86400000);
  const startDate = new Date(end.getTime() - 29 * 86400000);
  return googleQuery("https://youtubeanalytics.googleapis.com/v2/reports", {
    ids: "channel==" + m.trustChannelId(), startDate: startDate.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10),
    metrics: "views,estimatedMinutesWatched,subscribersGained", dimensions: "day", sort: "day"
  }, token);
}
async function status(owner) {
  const rows = await m.connections(owner);
  const get = provider => rows.find(row => row.provider === provider);
  const check = (provider, verify) => Promise.resolve().then(async () => {
    const row = get(provider);
    return row ? verify(await m.access(row)) : null;
  });
  const [driveResult, channelResult, report] = await Promise.allSettled([
    check("drive", m.folder),
    check("youtube", token => requireChannel(get("youtube"), token)),
    check("analytics", analytics)
  ]);
  const youtubeRow = get("youtube");
  return {
    connected: rows.length > 0,
    accounts: Object.fromEntries(rows.map(row => [row.provider, row.email])),
    driveFolderId: get("drive") ? config.GOOGLE_DRIVE_FOLDER_ID || null : null,
    drive: driveResult.value || null,
    driveError: driveResult.reason?.message || null,
    channel: channelResult.value ? { id: channelResult.value, name: youtubeRow.channel_name } : null,
    channelError: channelResult.reason?.message || null,
    analyticsError: report.reason?.message || null,
    analytics: report.value ? {
      views: (report.value.rows || []).reduce((sum, item) => sum + Number(item[1]), 0),
      minutes: (report.value.rows || []).reduce((sum, item) => sum + Number(item[2]), 0),
      subscribers: (report.value.rows || []).reduce((sum, item) => sum + Number(item[3]), 0)
    } : null
  };
}
async function requireChannel(row, token) {
  const item = await m.channel(token);
  if (!item || item.id !== row.channel_id) throw new PublicError("Reconnect using the Trust YouTube channel.", 409);
  return item.id;
}
const idValue = value => {
  if (!/^[\w-]{1,120}$/.test(value || "")) throw new PublicError("Invalid resource ID.");
  return value;
};
async function driveItem(token, id) {
  const root = await m.folder(token);
  const visited = new Set();
  let parent = idValue(id), item, original;
  while (parent && !visited.has(parent) && visited.size < 40) {
    if (parent === root.id) return original || { ...root, mimeType: "application/vnd.google-apps.folder" };
    visited.add(parent);
    item = await googleQuery(drive + "/files/" + parent, { fields: "id,name,parents,mimeType,trashed", supportsAllDrives: "true" }, token);
    if (item.trashed) break;
    original ||= item;
    parent = item.parents?.[0];
  }
  throw new PublicError("Item is outside the configured Drive folder.", 403);
}
async function verifyVideo(token, id, channelId) {
  const result = await googleQuery(youtube + "/videos", { part: "snippet", id: idValue(id) }, token);
  const item = result.items?.[0];
  if (item?.snippet?.channelId !== channelId) throw new PublicError("Video is not owned by the connected Trust channel.", 403);
  return item;
}
async function stage(owner, row, payload) {
  const id = m.uuid();
  const kinds = ["drive-photo", "drive-video", "youtube-video", "youtube-thumbnail"];
  if (!kinds.includes(payload.kind) || payload.consent !== true) throw new PublicError("Choose a supported operation and confirm media permission.");
  const limits = { "drive-photo": 25, "youtube-thumbnail": 2 };
  const max = (limits[payload.kind] || Number(config.MEDIA_VIDEO_LIMIT_MB || 512)) * 1024 ** 2;
  if (!Number.isSafeInteger(payload.size) || payload.size < 1 || payload.size > max) throw new PublicError("File size is outside the configured limit.");
  const request = {
    kind: payload.kind, size: payload.size, filename: String(payload.filename || "media").slice(0, 160),
    program: String(payload.program || "").trim().replace(/[\/\\\u0000-\u001f]/g, "-").slice(0, 120),
    title: String(payload.title || "").trim().slice(0, 100),
    description: String(payload.description || "").slice(0, 5000),
    playlist: payload.playlist ? idValue(payload.playlist) : "",
    playlistName: String(payload.playlistName || "").trim().slice(0, 150),
    videoId: payload.videoId ? idValue(payload.videoId) : "",
    madeForKids: payload.madeForKids === true,
    visibility: ["private","unlisted","public"].includes(payload.visibility) ? payload.visibility : "private"
  };
  if (request.kind.startsWith("drive") && !request.program) throw new PublicError("Enter the program name.");
  if (request.kind === "youtube-video" && (!request.title || typeof payload.madeForKids !== "boolean"))
    throw new PublicError("Enter the title and select the audience.");
  if (request.kind === "youtube-thumbnail" && !request.videoId) throw new PublicError("Select a video first.");
  const source = owner + "/" + id;
  const signed = await m.json(m.sb() + "/storage/v1/object/upload/sign/" + m.bucket + "/" + source, {
    method: "POST", headers: { ...m.serviceHeaders(), "Content-Type": "application/json" }, body: "{}"
  }, "Media staging");
  const signature = signed.token || new URL(signed.url, m.sb()).searchParams.get("token");
  const tus = new URL(m.required("SUPABASE_TUS_URL"));
  if (tus.protocol !== "https:" || !tus.pathname.endsWith("/storage/v1/upload/resumable") || tus.username || tus.password) throw new PublicError("Invalid Supabase resumable upload endpoint.", 503);
  tus.pathname = tus.pathname.replace(/\/$/, "") + "/sign";
  if (!signature) throw new PublicError("Supabase did not return a staging signature.", 502);
  await db("media_upload_jobs", "", "POST", { id, owner_id: owner, source_path: source, request, connection_at: row.updated_at, status: "staging" });
  return { id, source, signature, bucket: m.bucket, endpoint: tus.href };
}
async function queue(owner, payload, retry) {
  const id = idValue(payload.id);
  const filter = "?id=eq." + id + "&owner_id=eq." + owner;
  const job = (await db("media_upload_jobs", filter))[0];
  if (!job) throw new PublicError("Upload job was not found.", 404);
  const row = await m.connection(owner, m.uploadProvider(job.request.kind));
  if (job.connection_at !== row?.updated_at) throw new PublicError("Google connection changed. Start a new upload.", 409);
  const next = await db("media_upload_jobs", filter + "&status=eq." + (retry ? "failed" : "staging"), "PATCH", {
    status: "queued", stage: "Queued for processing", error: null, updated_at: new Date().toISOString()
  });
  if (!next.length) throw new PublicError("That upload cannot be queued from its current state.", 409);
  return { id, status: "queued" };
}
async function perform(owner, action, payload, res) {
  if (action === "connect") return start(owner, payload.provider, res);
  if (action === "status") return status(owner);
  if (action === "history") {
    const [jobs, activeJobs, events] = await Promise.all([
      db("media_upload_jobs", "?owner_id=eq." + owner + "&select=id,status,stage,result,error,created_at,request&order=created_at.desc&limit=25"),
      db("media_upload_jobs", "?owner_id=eq." + owner + "&status=in.(queued,processing)&select=id,status,stage,result,error,created_at,request&order=created_at.desc"),
      db("media_activity_events", "?owner_id=eq." + owner + "&select=action,details,created_at&order=created_at.desc&limit=25")
    ]);
    return { jobs: [...new Map([...jobs, ...activeJobs].map(job => [job.id, job])).values()], events };
  }
  if (action === "cancel-queued") {
    const id = idValue(payload.id);
    const rows = await db("media_upload_jobs", "?id=eq." + id + "&owner_id=eq." + owner + "&status=eq.queued", "PATCH", {
      status: "failed", stage: "Cancelled before processing", error: null, updated_at: new Date().toISOString()
    });
    if (!rows.length) throw new PublicError("This upload is no longer queued. Refresh the job list.", 409);
    return { id };
  }
  if (action === "disconnect") {
    await assertUploadsIdle(owner);
    for (const row of await m.connections(owner)) {
      try {
        await m.json("https://oauth2.googleapis.com/revoke", {
          method: "POST", body: new URLSearchParams({ token: m.unseal(row.encrypted_refresh, m.connectionKey(row)) })
        }, "Google token revocation");
      } catch (error) {
        if (error.message !== "Google token revocation returned HTTP 400 (invalid_token).") throw error;
      }
      await db("media_google_provider_connections", "?owner_id=eq." + owner + "&provider=eq." + row.provider +
        "&updated_at=eq." + encodeURIComponent(row.updated_at), "DELETE");
      m.tokenCache.delete(m.connectionKey(row));
    }
    await m.audit(owner, "google_disconnected");
    return { disconnected: true };
  }
  if (action === "queue" || action === "retry") return queue(owner, payload, action === "retry");
  const providers = {
    "drive-list": "drive", "drive-trash": "drive", "drive-programs": "drive", "drive-picker": "drive",
    "youtube-list": "youtube", "youtube-edit": "youtube", "youtube-delete": "youtube"
  };
  const provider = action === "stage" ? m.uploadProvider(payload.kind) : Object.hasOwn(providers, action) && providers[action];
  if (!provider) throw new PublicError("Unknown media action.");
  const row = await m.connection(owner, provider);
  if (!row) throw new PublicError("Connect " + (provider === "drive" ? "Google Drive" : "the Trust YouTube channel") + " first.", 409);
  const token = await m.access(row);
  if (action === "stage") {
    if (String(payload.kind).startsWith("drive")) await m.folder(token);
    else {
      const channelId = await requireChannel(row, token);
      if (payload.kind === "youtube-thumbnail") await verifyVideo(token, payload.videoId, channelId);
    }
    return stage(owner, row, payload);
  }
  if (action === "drive-picker") {
    const clientId = m.required("GOOGLE_CLIENT_ID");
    const appId = /^([0-9]+)-/.exec(clientId)?.[1];
    if (!appId || !config.GOOGLE_PICKER_API_KEY) {
      throw new PublicError("Set GOOGLE_PICKER_API_KEY and enable Google Picker API in the OAuth project.", 503);
    }
    return { token, appId, apiKey: config.GOOGLE_PICKER_API_KEY, folderId: m.required("GOOGLE_DRIVE_FOLDER_ID") };
  }
  if (action === "drive-programs") {
    const root = await m.folder(token);
    const folders = async parent => {
      const items = [];
      let pageToken;
      do {
        const page = await googleQuery(drive + "/files", {
          q: "'" + idValue(parent) + "' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'",
          fields: "nextPageToken,files(id,name)", pageSize: "100", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
          ...(pageToken ? { pageToken } : {})
        }, token);
        items.push(...(page.files || []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return items;
    };
    const years = (await folders(root.id)).filter(item => /^\d{4}$/.test(item.name));
    const programs = (await Promise.all(years.map(year => folders(year.id)))).flat();
    return { names: [...new Set(programs.map(item => item.name))].sort((a, b) => a.localeCompare(b)) };
  }
  if (action === "drive-list") {
    const item = payload.parent ? await driveItem(token, payload.parent) : await m.folder(token);
    const result = await googleQuery(drive + "/files", {
      q: "'" + idValue(item.id) + "' in parents and trashed = false", orderBy: "folder,name_natural",
      fields: "nextPageToken,files(id,name,mimeType,webViewLink,size)", pageSize: "100",
      supportsAllDrives: "true", includeItemsFromAllDrives: "true",
      ...(payload.page ? { pageToken: String(payload.page) } : {})
    }, token);
    return { parent: item, files: result.files || [], nextPage: result.nextPageToken };
  }
  if (action === "drive-trash") {
    const root = await m.folder(token);
    const item = await driveItem(token, payload.id);
    if (item.id === root.id || item.mimeType === "application/vnd.google-apps.folder")
      throw new PublicError("Select a file inside the configured folder.", 403);
    await google(drive + "/files/" + item.id + "?supportsAllDrives=true", token, "PATCH", { trashed: true });
    await m.audit(owner, action, { id: item.id });
    return { ok: true };
  }
  const channelId = await requireChannel(row, token);
  if (action === "youtube-list") {
    const info = await googleQuery(youtube + "/channels", { part: "contentDetails", id: channelId }, token);
    const uploads = info.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new PublicError("No channel uploads playlist was returned.", 502);
    const [videos, playlists] = await Promise.all([
      googleQuery(youtube + "/playlistItems", { part: "snippet", playlistId: uploads, maxResults: "50", ...(payload.page ? { pageToken: String(payload.page) } : {}) }, token),
      googleQuery(youtube + "/playlists", { part: "snippet", mine: "true", maxResults: "50" }, token)
    ]);
    return {
      videos: (videos.items || []).map(item => ({ id: item.snippet.resourceId.videoId, title: item.snippet.title, description: item.snippet.description })),
      playlists: (playlists.items || []).map(item => ({ id: item.id, title: item.snippet.title })),
      nextPage: videos.nextPageToken
    };
  }
  const video = await verifyVideo(token, payload.id, channelId);
  if (action === "youtube-edit") {
    const title = String(payload.title || "").trim().slice(0, 100);
    if (!title) throw new PublicError("Video title is required.");
    const { categoryId, tags, defaultLanguage, defaultAudioLanguage } = video.snippet;
    await google(youtube + "/videos?part=snippet", token, "PUT", {
      id: video.id, snippet: { title, description: String(payload.description || "").slice(0, 5000), categoryId, tags, defaultLanguage, defaultAudioLanguage }
    });
  } else {
    await google(youtube + "/videos?id=" + video.id, token, "DELETE");
  }
  await m.audit(owner, action, { id: video.id });
  return { ok: true };
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const isCallback = new URL(req.url, "http://local.invalid").pathname === callbackPath;
  try {
    if (isCallback) {
      if (req.method !== "GET") throw new PublicError("Method not allowed.", 405);
      return await callback(req, res);
    }
    if (req.method !== "POST") throw new PublicError("Method not allowed.", 405);
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const owner = await m.admin(req);
    return res.status(200).json(await perform(owner, payload.action, payload, res));
  } catch (error) {
    const message = error instanceof PublicError ? error.message : "Media service could not complete the request.";
    return isCallback ? res.status(error.status || 500).send(message + " Return to the Admin Portal and try again.") :
      res.status(error.status || 500).json({ error: message });
  }
};

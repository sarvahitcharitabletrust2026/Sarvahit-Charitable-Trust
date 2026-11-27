const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const m = require("./google-media.cjs");
const exec = promisify(execFile);
const { db, drive, youtube, google, googleQuery } = m;
const folderType = "application/vnd.google-apps.folder";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const qs = params => "?" + new URLSearchParams(params);
const filePath = (job, directory) => path.join(directory, "input");
function guardedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["www.googleapis.com", "www.youtube.com", "youtube.googleapis.com", "upload.youtube.com"].includes(url.hostname))
    throw new Error("Unexpected Google upload host.");
  return url;
}
async function runFfmpeg(job, input, directory) {
  const photo = job.request.kind === "drive-photo";
  const logo = m.required("MEDIA_WATERMARK_FILE");
  const target = path.join(directory, photo ? "watermarked.jpg" : "watermarked.mp4");
  const filter = "[1:v]format=rgba,colorchannelmixer=aa=0.4[logo];[logo][0:v]scale2ref=w=iw*0.18:h=ow/mdar[wm][base];[base][wm]overlay=W-w-W*0.02:H-h-H*0.02:format=auto[out]";
  const args = ["-nostdin","-loglevel","error","-threads","2","-filter_complex_threads","1","-i",input,"-i",logo,
    "-filter_complex",filter,"-map","[out]"];
  if (photo) args.push("-frames:v","1","-q:v","2");
  else args.push("-map","0:a?","-c:v","libx264","-threads","2","-preset","fast","-crf","20", "-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart");
  try { await exec(process.env.FFMPEG_PATH || "ffmpeg", [...args, target], { timeout: 2 * 60 * 60 * 1000 }); }
  catch { throw new Error("FFmpeg could not process the source or the configured Trust logo."); }
  return { target, mime: photo ? "image/jpeg" : "video/mp4" };
}
function escaped(value) { return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
async function driveFolder(token, parent, name) {
  if (!/^[\w-]+$/.test(parent)) throw new Error("Invalid Drive folder ID.");
  const result = await googleQuery(drive + "/files", {
    q: "'" + parent + "' in parents and name = '" + escaped(name) + "' and mimeType = '" + folderType + "' and trashed = false",
    fields: "files(id,name)", pageSize: "1", supportsAllDrives: "true", includeItemsFromAllDrives: "true"
  }, token);
  if (result.files?.[0]) return result.files[0].id;
  return (await google(drive + "/files?supportsAllDrives=true&fields=id", token, "POST",
    { name, parents: [parent], mimeType: folderType })).id;
}
async function resumable({ url, token, target, mime, metadata, onProgress, onRemoteStart }) {
  const size = (await fsp.stat(target)).size;
  if (!size) throw new Error("The processed file is empty.");
  const init = await fetch(guardedUrl(url), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json",
      "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(size) },
    body: JSON.stringify(metadata)
  });
  if (!init.ok || !init.headers.get("location")) throw new Error("Google rejected the upload session (HTTP " + init.status + ").");
  const session = guardedUrl(init.headers.get("location"));
  await onRemoteStart();
  const input = await fsp.open(target, "r");
  let offset = 0, retries = 0;
  const chunkSize = 8 * 1024 * 1024;
  const options = { method: "PUT", redirect: "manual" };
  try {
    while (offset < size) {
      const length = Math.min(chunkSize, size - offset);
      const bytes = await input.read(Buffer.alloc(length), 0, length, offset);
      if (bytes.bytesRead !== length) throw new Error("Processed file changed during upload.");
      let response = await fetch(session, { ...options, signal: AbortSignal.timeout(90000), headers: {
        Authorization: "Bearer " + token, "Content-Type": mime, "Content-Length": String(length),
        "Content-Range": "bytes " + offset + "-" + (offset + length - 1) + "/" + size
      }, body: bytes.buffer }).catch(() => null);
      if (!response || response.status >= 500 || response.status === 429) {
        if (++retries > 4) throw new Error("Google upload did not confirm completion. Check the destination before retrying.");
        await wait(1000 * 2 ** retries);
        response = await fetch(session, { ...options, signal: AbortSignal.timeout(30000), headers: {
          Authorization: "Bearer " + token, "Content-Length": "0", "Content-Range": "bytes */" + size
        } }).catch(() => null);
        if (!response || response.status >= 500 || response.status === 429) continue;
      }
      if (response.ok) {
        const result = await response.json();
        if (!result?.id) throw new Error("Google did not return an uploaded file or video ID.");
        return result;
      }
      if (response.status !== 308) throw new Error("Google rejected an upload chunk (HTTP " + response.status + ").");
      const range = response.headers.get("range")?.match(/^bytes=0-(\d+)$/);
      const next = range ? Number(range[1]) + 1 : 0;
      if (next > size || (next <= offset && ++retries > 4)) throw new Error("Google stopped advancing the resumable upload.");
      if (next > offset) retries = 0;
      offset = next;
      await onProgress(Math.floor(offset / size * 100));
    }
    throw new Error("Google did not confirm upload completion.");
  } finally { await input.close(); }
}
async function processJob(job) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "sarvahit-media-"));
  const filter = "?id=eq." + job.id + "&status=eq.processing";
  let remoteStarted = false, result;
  const update = fields => db("media_upload_jobs", filter, "PATCH", { ...fields, updated_at: new Date().toISOString() });
  try {
    await m.verifyAdminId(job.owner_id);
    const row = await m.connection(job.owner_id, m.uploadProvider(job.request.kind));
    if (row?.updated_at !== job.connection_at) throw new Error("Google connection changed. Start a new upload.");
    const token = await m.access(row);
    const request = job.request;
    const input = filePath(job, directory);
    const source = await fetch(m.sb() + "/storage/v1/object/authenticated/" + m.bucket + "/" + job.source_path, {
      headers: m.serviceHeaders(), signal: AbortSignal.timeout(300000)
    });
    if (!source.ok) throw new Error("The staged file is unavailable. Stage it again.");
    if (Number(source.headers.get("content-length")) > request.size) throw new Error("Staged file is larger than expected.");
    let downloaded = 0;
    await pipeline(Readable.fromWeb(source.body), async function* (stream) {
      for await (const bytes of stream) {
        downloaded += bytes.length;
        if (downloaded > request.size) throw new Error("Staged file is larger than expected.");
        yield bytes;
      }
    }, fs.createWriteStream(input));
    if (downloaded !== request.size) throw new Error("Staged file size does not match the upload request.");
    await update({ stage: "Processing media" });
    const isDrive = request.kind.startsWith("drive");
    if (!isDrive) {
      const channel = await m.channel(token);
      if (!channel || channel.id !== row.channel_id) throw new Error("Reconnect using the Trust YouTube channel.");
      if (request.playlist) {
        const list = await googleQuery(youtube + "/playlists", { part: "snippet", id: request.playlist }, token);
        if (list.items?.[0]?.snippet.channelId !== channel.id) throw new Error("Playlist is not owned by the Trust channel.");
      }
      if (request.kind === "youtube-thumbnail") {
        const video = await googleQuery(youtube + "/videos", { part: "snippet", id: request.videoId }, token);
        if (video.items?.[0]?.snippet.channelId !== channel.id) throw new Error("Video is not owned by the Trust channel.");
        const bytes = await fsp.readFile(input);
        const mime = bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg" :
          bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : null;
        if (!mime) throw new Error("Choose a JPG or PNG thumbnail.");
        await m.json("https://www.googleapis.com/upload/youtube/v3/thumbnails/set?uploadType=media&videoId=" + request.videoId,
          { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": mime }, body: bytes }, "YouTube thumbnail");
        result = { id: request.videoId, url: "https://youtu.be/" + request.videoId };
      }
    }
    if (!result) {
      const { target, mime } = await runFfmpeg(job, input, directory);
      let url, metadata;
      if (isDrive) {
        const root = await m.folder(token);
        const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(job.created_at));
        const destination = await driveFolder(token, await driveFolder(token, root.id, year), request.program);
        const filename = request.filename.replace(/\.[^.]+$/, "").replace(/[\/\\\u0000-\u001f]/g, "-").slice(0, 120);
        url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink";
        metadata = { name: (filename || "Media") + (mime === "image/jpeg" ? ".jpg" : ".mp4"), parents: [destination], appProperties: { mediaJob: job.id } };
      } else {
        url = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
        metadata = { snippet: { title: request.title, description: request.description, categoryId: "29" },
          status: { privacyStatus: request.visibility, selfDeclaredMadeForKids: request.madeForKids } };
      }
      const media = await resumable({ url, token, target, mime, metadata, onRemoteStart: async () => {
        await update({ stage: "Uploading to Google" });
        remoteStarted = true;
      }, onProgress: percent => update({ stage: "Uploading to Google · " + percent + "%" }) });
      result = { id: media.id, url: isDrive ? media.webViewLink || "https://drive.google.com/open?id=" + media.id : "https://youtu.be/" + media.id,
        ...(media.status?.privacyStatus ? { visibility: media.status.privacyStatus } : {}) };
      if ((request.playlist || request.playlistName) && !isDrive) {
        try {
          let playlistId = request.playlist;
          if (!playlistId) {
            const created = await google(youtube + "/playlists?part=snippet,status", token, "POST", {
              snippet: { title: request.playlistName }, status: { privacyStatus: "private" }
            });
            playlistId = created.id;
          }
          await google(youtube + "/playlistItems?part=snippet", token, "POST", {
            snippet: { playlistId, resourceId: { kind: "youtube#video", videoId: media.id } }
          });
        } catch { result.warning = "Video uploaded. YouTube did not confirm adding it to the playlist."; }
      }
    }
    await update({ status: "done", stage: "Confirmed by Google", result, error: null });
    await m.audit(job.owner_id, request.kind + "_uploaded", { job: job.id, id: result.id }).catch(() => {});
    await fetch(m.sb() + "/storage/v1/object/" + m.bucket, { method: "DELETE", signal: AbortSignal.timeout(10000),
      headers: { ...m.serviceHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [job.source_path] }) }).catch(() => {});
  } catch (error) {
    await update({ status: remoteStarted || result ? "review" : "failed", stage: remoteStarted || result ? "Check destination" : "Failed",
      result: result || null, error: typeof error.message === "string" ? error.message.slice(0, 220) : "Media processing failed." });
  } finally { await fsp.rm(directory, { recursive: true, force: true }); }
}
async function main() {
  for (;;) {
    try {
      const [next] = await db("media_upload_jobs", "?status=eq.queued&order=created_at.asc&limit=1");
      if (next) {
        const [claimed] = await db("media_upload_jobs", "?id=eq." + next.id + "&status=eq.queued", "PATCH",
          { status: "processing", stage: "Downloading staged media", updated_at: new Date().toISOString() });
        if (claimed) await processJob(claimed);
      }
    } catch { console.error("Media worker could not access the queue. Check its environment and Supabase availability."); }
    await wait(5000);
  }
}
if (require.main === module) main();
module.exports = { runFfmpeg, resumable };

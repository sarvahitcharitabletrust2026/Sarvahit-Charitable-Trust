(() => {
  const $ = id => document.getElementById(id);
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  };
  function button(text, handler) {
    const node = element("button", text);
    node.type = "button";
    node.addEventListener("click", handler);
    return node;
  }
  function link(text, url) {
    const node = element("a", text);
    node.href = url;
    node.rel = "noopener noreferrer";
    node.target = "_blank";
    return node;
  }
  function field(form, label, name, type, options = []) {
    const container = element("label");
    container.append(label);
    const input = element(type === "select" ? "select" : type === "textarea" ? "textarea" : "input");
    if (input.tagName === "INPUT") input.type = type;
    input.name = name;
    for (const [value, title] of options) input.add(new Option(title, value));
    container.append(input);
    form.append(container);
    return input;
  }
  const styles = element("style", "[hidden]{display:none!important} #cloud dt{font-weight:700} #cloud dd{margin:0 0 .5rem} #cloud form.card{margin:1rem 0} #cloud button{margin:.15rem}");
  document.head.append(styles);
  const cloud = $("cloud");
  const videos = $("videos");
  const dashboard = $("dashboard");
  const account = element("div");
  const report = element("div");
  const dashboardMetrics = element("p", "Connect YouTube Analytics in Cloud Publishing to load analytics.");
  dashboard.append(element("h3", "YouTube Analytics · last 30 reported days"), dashboardMetrics);
  account.className = "card";
  account.append(element("h3", "Google Account & YouTube"));
  const connectionInfo = element("dl");
  connectionInfo.setAttribute("aria-live", "polite");
  const message = element("p");
  message.setAttribute("role", "status");
  report.setAttribute("role", "status");
  const activity = element("ul");
  const files = element("ul");
  const operations = element("div");
  let connected = false, busy = false, videoPage, drivePage, currentFolder = "";
  let lastJob, remoteVideos = [], activeJobs = false, loadingJobs = false;
  let upload = null, verifiedConnection = null;
  const request = (action, payload = {}) => {
    if (!window.googleMediaRequest) throw new Error("Open the deployed HTTPS Admin Portal and sign in as an admin.");
    return window.googleMediaRequest({ action, ...payload });
  };
  async function run(fn) {
    if (busy) return;
    busy = true;
    account.setAttribute("aria-busy", "true");
    operations.inert = true;
    message.textContent = "Working…";
    try { message.textContent = await fn() || ""; }
    catch (error) { message.textContent = error.message; }
    finally { busy = false; operations.inert = false; account.setAttribute("aria-busy", "false"); }
  }
  async function status() {
    let state;
    try { state = await request("status"); }
    catch (error) {
      verifiedConnection = null;
      connected = false;
      connectionInfo.replaceChildren();
      updateUploadAvailability();
      throw error;
    }
    verifiedConnection = state;
    connected = state.connected === true;
    updateUploadAvailability();
    connectionInfo.replaceChildren();
    const items = [
      ["Google Drive account", state.accounts?.drive || "Disconnected"],
      ["YouTube account", state.accounts?.youtube || "Disconnected"],
      ["YouTube Analytics account", state.accounts?.analytics || "Disconnected"],
      ["Google Drive Connection Status", state.drive ? link(state.drive.name + " · " + state.drive.id, state.drive.url) : state.driveError || "Unavailable"],
      ["YouTube Channel Connection Status", state.channel ? state.channel.name + " · " + state.channel.id : state.channelError || "Disconnected"],
      ["YouTube Analytics Connection Status", state.analytics ? "Verified" : state.analyticsError || "Disconnected"]
    ];
    for (const [name, value] of items) {
      const term = element("dt", name);
      const definition = element("dd");
      definition.append(value);
      connectionInfo.append(term, definition);
    }
    dashboardMetrics.textContent = state.analytics
      ? state.analytics.views + " views · " + state.analytics.minutes + " minutes watched · " + state.analytics.subscribers + " subscribers gained"
      : "YouTube Analytics unavailable.";
  }
  function connect(provider) {
    if (busy) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) { message.textContent = "Allow the Google sign-in popup and try again."; return; }
    popup.opener = null;
    run(async () => {
      try {
        const { url } = await request("connect", { provider });
        popup.location.replace(url);
        return "Complete Google consent, then click Refresh Status.";
      } catch (error) { popup.close(); throw error; }
    });
  }
  const actions = element("div");
  actions.className = "actions";
  actions.append(
    button("Connect Google Drive", () => connect("drive")),
    button("Connect YouTube Channel", () => connect("youtube")),
    button("Connect YouTube Analytics", () => connect("analytics")),
    button("Test Connection", () => run(status)), button("Refresh Status", () => run(status)),
    button("Reconnect Google Drive", () => connect("drive")), button("Disconnect Accounts", () => {
      if (!connected || !confirm("Revoke this portal’s Google permissions and disconnect all Google connections?")) return;
      run(async () => { await request("disconnect"); await status(); return "Google confirmed revocation."; });
    })
  );
  account.append(connectionInfo, actions, message);
  const cloudHeader = cloud.querySelector(".studio-tab-header");
  cloudHeader.after(account);
  for (const child of [...cloud.children]) {
    if (child !== account && child !== cloudHeader) child.hidden = true;
  }
  const uploadForm = element("form");
  uploadForm.className = "card";
  const kind = field(uploadForm, "Destination", "kind", "select", [
    ["drive-photo","Google Drive photo"], ["drive-video","Google Drive video"],
    ["youtube-video","YouTube video"], ["youtube-thumbnail","YouTube thumbnail"]
  ]);
  const media = field(uploadForm, "Media file", "media", "file");
  media.required = true;
  const program = field(uploadForm, "Program name", "program", "text");
  const title = field(uploadForm, "Video title", "title", "text");
  title.maxLength = 100;
  const description = field(uploadForm, "Description", "description", "textarea");
  const visibility = field(uploadForm, "Visibility", "visibility", "select", [["private","Private"],["unlisted","Unlisted"],["public","Public"]]);
  const audience = field(uploadForm, "Audience", "audience", "select", [["","Select audience"],["no","Not made for kids"],["yes","Made for kids"]]);
  const playlist = field(uploadForm, "Playlist", "playlist", "select", [["","No playlist"]]);
  const thumbnailVideo = field(uploadForm, "Video to update", "videoId", "select", [["","Select video"]]);
  const consent = field(uploadForm, "I confirm I have permission to upload this media", "consent", "checkbox");
  consent.required = true;
  const progress = element("progress");
  progress.max = 100;
  progress.value = 0;
  const submit = element("button", "Upload Media");
  submit.type = "submit";
  const uploadHint = element("p");
  uploadHint.className = "muted";
  uploadHint.setAttribute("role", "status");
  function updateUploadAvailability() {
    const local = location.protocol === "file:" || new URL(document.baseURI).protocol === "file:";
    const drive = kind.value.startsWith("drive");
    const ready = drive ? verifiedConnection?.drive : verifiedConnection?.channel;
    submit.disabled = local || !ready || Boolean(upload) || !overlay.hidden;
    uploadHint.textContent = local ? "Cloud uploading needs the deployed HTTPS Admin Portal. This copy is opened from a local file." :
      !verifiedConnection?.connected ? "Connect your Google account and refresh status to enable cloud uploads." :
      !ready ? (drive ? "Verify access to the configured Drive folder." : "Connect and verify the Trust YouTube channel.") : "";
  }
  const overlay = element("div", "Upload in progress. Keep this tab open until staging is complete.");
  overlay.setAttribute("role", "status");
  overlay.hidden = true;
  function updateDestination() {
    const yt = kind.value === "youtube-video";
    const thumb = kind.value === "youtube-thumbnail";
    for (const control of [title, description, visibility, audience, playlist]) control.closest("label").hidden = !yt;
    thumbnailVideo.closest("label").hidden = !thumb;
    program.closest("label").hidden = !kind.value.startsWith("drive");
    title.required = audience.required = yt;
    thumbnailVideo.required = thumb;
    program.required = kind.value.startsWith("drive");
    media.accept = thumb ? "image/jpeg,image/png" : kind.value === "drive-photo" ? "image/jpeg,image/png,image/webp" : "video/*";
    updateUploadAvailability();
  }
  kind.addEventListener("change", updateDestination);
  uploadForm.addEventListener("reset", () => queueMicrotask(() => {
    updateDestination();
    if (!upload) { progress.value = 0; report.textContent = ""; }
  }));
  uploadForm.append(uploadHint, submit, progress, overlay, report);
  uploadForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (upload || submit.disabled || !uploadForm.reportValidity()) return;
    if (!window.tus?.Upload) { report.textContent = "Resumable-upload library could not load."; return; }
    const file = media.files[0];
    if (!file || !consent.checked) return;
    submit.disabled = true;
    overlay.hidden = false;
    report.textContent = "Preparing private staging…";
    try {
      const staged = await request("stage", {
        kind: kind.value, program: program.value, title: title.value, description: description.value,
        visibility: visibility.value, madeForKids: audience.value === "yes", playlist: playlist.value,
        videoId: thumbnailVideo.value, consent: consent.checked, size: file.size, filename: file.name
      });
      await new Promise((resolve, reject) => {
        upload = new window.tus.Upload(file, {
          endpoint: staged.endpoint, headers: { "x-signature": staged.signature },
          chunkSize: 6 * 1024 * 1024, uploadDataDuringCreation: true, storeFingerprintForResuming: false,
          retryDelays: [0, 1000, 3000, 5000, 10000],
          metadata: { bucketName: staged.bucket, objectName: staged.source, contentType: file.type || "application/octet-stream" },
          onProgress: (sent, total) => { progress.value = sent / total * 100; report.textContent = "Staging · " + Math.floor(progress.value) + "%"; },
          onSuccess: resolve, onError: () => reject(new Error("Staging upload failed after retries. Try uploading the file again."))
        });
        upload.start();
      });
      lastJob = staged.id;
      await request("queue", { id: staged.id });
      report.textContent = "Queued. The worker will process the watermark and upload to Google.";
      await loadHistory();
    } catch (error) { report.textContent = error.message; }
    finally { upload = null; overlay.hidden = true; updateUploadAvailability(); }
  });
  async function loadHistory() {
    if (loadingJobs) return;
    loadingJobs = true;
    try {
    const data = await request("history");
    activeJobs = data.jobs.some(job => ["queued", "processing"].includes(job.status));
    activity.replaceChildren();
    for (const job of data.jobs) {
      const row = element("li", job.request.filename + " · " + job.stage + (job.error ? " · " + job.error : ""));
      if (job.result?.url) row.append(" ", link("Open on Google", job.result.url));
      if (job.result?.visibility) row.append(" · " + job.result.visibility);
      if (job.result?.warning) row.append(" · " + job.result.warning);
      if (job.status === "failed") row.append(" ", button("Retry", () => run(async () => {
        await request("retry", { id: job.id }); await loadHistory(); return "Upload queued for retry.";
      })));
      activity.append(row);
      if (job.id === lastJob) report.textContent = job.stage + (job.error ? " · " + job.error : "");
    }
    for (const event of data.events) activity.append(element("li", new Date(event.created_at).toLocaleString() + " · " + event.action));
    } finally { loadingJobs = false; }
  }
  async function listDrive(parent = "", page) {
    const response = await request("drive-list", { parent, page });
    currentFolder = response.parent.id;
    drivePage = response.nextPage;
    if (!page) files.replaceChildren();
    for (const file of response.files) {
      const row = element("li");
      if (file.mimeType === "application/vnd.google-apps.folder") row.append(button(file.name, () => run(() => listDrive(file.id))));
      else {
        row.append(link(file.name, file.webViewLink || "https://drive.google.com/open?id=" + file.id), " ",
          button("Move to Trash", () => {
            if (!confirm("Move this Google Drive file to Trash?")) return;
            run(async () => { await request("drive-trash", { id: file.id }); await listDrive(currentFolder); return "Google confirmed the move to Trash."; });
          }));
      }
      files.append(row);
    }
    return "Showing Drive folder " + response.parent.name + ".";
  }
  const videoEditor = element("form");
  const selected = field(videoEditor, "Channel video", "id", "select", [["","Select video"]]);
  selected.required = true;
  const editTitle = field(videoEditor, "Title", "title", "text");
  editTitle.required = true;
  const editDescription = field(videoEditor, "Description", "description", "textarea");
  selected.addEventListener("change", () => {
    const video = remoteVideos.find(item => item.id === selected.value);
    editTitle.value = video?.title || "";
    editDescription.value = video?.description || "";
  });
  const editSubmit = element("button", "Save YouTube Changes");
  editSubmit.type = "submit";
  videoEditor.append(editSubmit, button("Delete Video", () => {
    if (!selected.value || !confirm("Permanently delete this video from the Trust YouTube channel?")) return;
    run(async () => { await request("youtube-delete", { id: selected.value }); await listYouTube(); return "YouTube confirmed deletion."; });
  }));
  videoEditor.addEventListener("submit", event => {
    event.preventDefault();
    run(async () => {
      await request("youtube-edit", { id: selected.value, title: editTitle.value, description: editDescription.value });
      await listYouTube(); return "YouTube confirmed the metadata update.";
    });
  });
  async function listYouTube(page) {
    const data = await request("youtube-list", { page });
    videoPage = data.nextPage;
    remoteVideos = page ? [...remoteVideos, ...data.videos] : data.videos;
    for (const select of [selected, thumbnailVideo, playlist]) {
      const old = select.value;
      const list = select === playlist ? data.playlists : remoteVideos;
      select.replaceChildren(new Option(select === playlist ? "No playlist" : "Select video", ""), ...list.map(item => new Option(item.title, item.id)));
      if (list.some(item => item.id === old)) select.value = old;
    }
    selected.dispatchEvent(new Event("change"));
  }
  operations.className = "card";
  operations.append(element("h3", "Media Upload"), uploadForm,
    element("h3", "Google Drive Files"), button("Open Root Folder", () => run(() => listDrive())),
    button("Load More Files", () => drivePage && run(() => listDrive(currentFolder, drivePage))), files,
    element("h3", "Manage YouTube Videos"), button("Load Channel Videos & Playlists", () => run(() => listYouTube())),
    button("Load More Videos", () => videoPage && run(() => listYouTube(videoPage))), videoEditor,
    element("h3", "Upload Jobs & Activity"), button("Refresh Jobs", () => run(loadHistory)), activity);
  cloud.append(operations);
  videos.append(button("Open Direct YouTube Upload", () => { go("cloud"); kind.value = "youtube-video"; updateDestination(); media.focus(); }));
  $("photos").append(button("Open OAuth Drive Upload", () => { go("cloud"); kind.value = "drive-photo"; updateDestination(); media.focus(); }));
  updateDestination();
  setInterval(() => { if (activeJobs && !document.hidden) loadHistory().catch(() => {}); }, 5000);
  document.addEventListener("google-media-ready", () => run(async () => { await status(); await loadHistory(); }), { once: true });
  window.refreshGoogleMedia = tab => {
    if (tab === "cloud" || tab === "dashboard" || tab === "accounts") return run(async () => { await status(); await loadHistory(); });
  };
})();

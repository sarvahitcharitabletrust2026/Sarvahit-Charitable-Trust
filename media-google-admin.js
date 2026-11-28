(() => {
  const $ = id => document.getElementById(id);
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  };
  function feedback(node, text, error = false) {
    node.textContent = text;
    node.classList.toggle("media-error", error);
  }
  function button(text, handler, variant = "light") {
    const node = element("button", text);
    node.type = "button";
    node.className = "btn btn-" + variant;
    node.addEventListener("click", async event => {
      const result = handler(event);
      if (!result?.then) return;
      node.disabled = true;
      node.textContent = "Processing…";
      try { await result; }
      finally { node.disabled = false; node.textContent = text; }
    });
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
  styles.textContent += ".media-error{color:#a92328!important}.media-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:12px}.media-status-card{text-align:center;border:1px solid #bfd6ca;border-radius:10px}.media-status-card dt,.media-status-pill{display:block;padding:10px}.media-status-pill{position:relative;background:#fce4e4;color:#8e2424;font-weight:700}.media-status-pill.connected{background:#d7f0df;color:#105a38}.media-status-pill:is(:hover,:focus) #cloud .media-job-details ul{max-height:15rem;overflow:auto}#cloud .media-operation{margin-block:1rem}";
  styles.textContent += ".media-status-card dd{margin:0}#cloud button.btn{margin:0}";
  styles.textContent += ".media-status-card dd{position:relative;margin:0}.media-status-pill{width:100%;min-height:44px;border:0;cursor:pointer}.media-status-pill:not(.connected){background:#fce4e4;color:#8e2424}.media-status-pill.connected{background:#d7f0df;color:#105a38}.media-status-card:focus-within,.media-status-card:hover{position:relative;z-index:3}.media-status-detail{position:absolute;inset:100% 0 auto;z-index:4;margin:0;padding:12px;border:1px solid #779786;border-radius:8px;background:#fff;color:#173a32;box-shadow:0 6px 16px #10251b33;text-align:left;overflow-wrap:anywhere}.media-status-detail p{margin:0}.media-status-detail a{display:block;margin-top:8px;text-decoration:underline}";
  document.head.append(styles);
  styles.textContent += ".media-status-card{background:#f1f7f3}.media-status-card h3{margin:0;padding:10px}.media-status-pill{border-radius:0 0 9px 9px}.media-connection-actions{display:grid;gap:10px;margin-block:16px}.media-connection-actions div{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.media-connection-actions strong{flex:0 0 8rem}.media-card-header{display:flex;align-items:center;flex-wrap:wrap;gap:12px}.media-card-header h3{margin:0}.media-preview summary{cursor:pointer;font-weight:700;color:#0c4b3b}";
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
  connectionInfo.className = "media-status-grid";
  connectionInfo.setAttribute("aria-live", "polite");
  const accountOverview = $("accountList");
  accountOverview.className = "media-status-grid";
  const accountMetrics = accountOverview.parentElement.querySelector("p");
  const message = element("p");
  message.setAttribute("role", "status");
  report.setAttribute("role", "status");
  const activity = element("ul");
  const details = element("details");
  details.className = "media-job-details";
  const jobSummary = element("summary", "Show upload jobs and activity");
  details.append(jobSummary, activity);
  const jobsMessage = element("p");
  jobsMessage.setAttribute("role", "status");
  const driveMessage = element("p");
  driveMessage.setAttribute("role", "status");
  const files = element("ul");
  const operations = element("div");
  let connected = false, busy = false, videoPage, drivePage, currentFolder = "";
  let lastJob, remoteVideos = [], activeJobs = false, loadingJobs = false;
  let upload = null, verifiedConnection = null;
  const request = (action, payload = {}) => {
    if (!window.googleMediaRequest) throw new Error("Open the deployed HTTPS Admin Portal and sign in as an admin.");
    return window.googleMediaRequest({ action, ...payload });
  };
  async function run(fn, target = message) {
    if (busy) return;
    busy = true;
    account.setAttribute("aria-busy", "true");
    operations.inert = true;
    feedback(target, "Processing…");
    try { feedback(target, await fn() || "Successfully updated."); return true; }
    catch (error) { feedback(target, error.message, true); return false; }
    finally { busy = false; operations.inert = false; account.setAttribute("aria-busy", "false"); }
  }
  function renderConnections(state = {}, requestError) {
    const items = [
      ["Google Drive account", "drive", state.drive, state.driveError, state.drive?.name],
      ["YouTube account", "youtube", state.channel, state.channelError, state.channel?.name],
      ["YouTube Analytics account", "analytics", state.analytics, state.analyticsError]
    ];
    function renderCard([name, provider, verified, error, accountName], scope) {
      const card = element("div");
      card.className = "media-status-card";
      const definition = element(scope === "cloud" ? "dd" : "div");
      const badge = element("button", verified ? "Connected" : "Unconnected");
      badge.className = "media-status-pill" + (verified ? " connected" : "");
      const email = state.accounts?.[provider];
      const description = verified
        ? [...new Set([accountName, email].filter(Boolean))].join(" · ") || "Account verified by Google."
        : ["instagram", "facebook", "whatsapp"].includes(provider)
          ? "This platform has no connection configured in the Media Studio."
          : error || requestError || "Connect this account in Cloud Publishing & Setup.";
      badge.type = "button";
      const detail = element("div");
      detail.className = "media-status-detail";
      detail.id = "media-status-" + scope + "-" + provider;
      detail.hidden = true;
      detail.append(element("p", description));
      if (provider === "drive" && error && /^[\w-]+$/.test(state.driveFolderId || "")) {
        detail.append(link("Open configured folder in Google Drive", "https://drive.google.com/drive/folders/" + state.driveFolderId));
      }
      badge.setAttribute("aria-controls", detail.id);
      const reveal = (open) => {
        detail.hidden = !open;
        badge.setAttribute("aria-expanded", String(open));
      };
      reveal(false);
      definition.addEventListener("pointerenter", event => { if (event.pointerType !== "touch") reveal(true); });
      definition.addEventListener("pointerleave", () => { if (!definition.contains(document.activeElement)) reveal(false); });
      definition.addEventListener("focusout", event => { if (!definition.contains(event.relatedTarget)) reveal(false); });
      badge.addEventListener("focus", () => reveal(true));
      badge.addEventListener("click", () => reveal(true));
      definition.addEventListener("keydown", event => {
        if (event.key === "Escape" && !detail.hidden) {
          event.stopPropagation();
          badge.focus();
          reveal(false);
        }
      });
      definition.append(badge, detail);
      card.append(element(scope === "cloud" ? "dt" : "h3", name), definition);
      return card;
    }
    const otherPlatforms = [["Instagram", "instagram"], ["Facebook", "facebook"], ["WhatsApp", "whatsapp"]];
    connectionInfo.replaceChildren(...items.map(item => renderCard(item, "cloud")));
    accountOverview.replaceChildren(...[...items, ...otherPlatforms].map(item => renderCard(item, "overview")));
  }
  async function status() {
    let state;
    try { state = await request("status"); }
    catch (error) {
      verifiedConnection = null;
      connected = false;
      renderConnections({}, error.message);
      dashboardMetrics.textContent = "YouTube Analytics unavailable.";
      accountMetrics.textContent = dashboardMetrics.textContent;
      updateUploadAvailability();
      throw error;
    }
    verifiedConnection = state;
    connected = state.connected === true;
    updateUploadAvailability();
    renderConnections(state);
    if (state.drive) {
      try {
        const { names } = await request("drive-programs");
        setPrograms(names);
      } catch (error) { feedback(programMessage, error.message, true); }
    } else setPrograms([]);
    dashboardMetrics.textContent = state.analytics
      ? state.analytics.views + " views · " + state.analytics.minutes + " minutes watched · " + state.analytics.subscribers + " subscribers gained"
      : "YouTube Analytics unavailable.";
    accountMetrics.textContent = state.analytics
      ? "YouTube, last 30 reported days: " + dashboardMetrics.textContent
      : "Connect YouTube Analytics in Cloud Publishing & Setup to see live metrics.";
    return state.driveError ? "Google Drive needs attention. Open the Drive status for details." : "Account status refreshed.";
  }
  function connect(provider) {
    if (busy) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) { feedback(message, "Allow the Google sign-in popup and try again.", true); return; }
    popup.opener = null;
    return run(async () => {
      try {
        const { url } = await request("connect", { provider });
        popup.location.replace(url);
        const deadline = Date.now() + 5 * 60 * 1000;
        const watch = setInterval(() => {
          if (Date.now() > deadline) { clearInterval(watch); return; }
          let completed = false;
          try {
            completed = new URL(popup.location.href).searchParams.get("mediaOAuth") === "connected";
          } catch {}
          if (!completed && !popup.closed) return;
          if (busy) return;
          clearInterval(watch);
          if (completed) popup.close();
          void run(status);
        }, 1000);
        return "Complete Google consent in the popup.";
      } catch (error) { popup.close(); throw error; }
    });
  }
  const authorizeDriveFolder = async () => {
    await window.authorizeStudioDriveFolder(await request("drive-picker"));
    await status();
    if (!verifiedConnection?.drive) throw new Error(verifiedConnection?.driveError || "Drive folder verification failed.");
    return "Drive folder successfully verified.";
  };
  const actions = element("div");
  actions.className = "media-connection-actions";
  function actionRow(label, ...buttons) {
    const row = element("div");
    row.append(element("strong", label), ...buttons);
    actions.append(row);
  }
  actionRow("Google Drive",
    button("Connect Google Drive", () => connect("drive"), "primary"),
    button("Authorize Drive Folder", () => run(authorizeDriveFolder), "primary"),
    button("Reconnect Google Drive", () => connect("drive"))
  );
  actionRow("YouTube",
    button("Connect YouTube Channel", () => connect("youtube"), "primary"),
    button("Connect YouTube Analytics", () => connect("analytics"), "primary")
  );
  actionRow("Account access",
    button("Test Connection", () => run(status)), button("Refresh Status", () => run(status)),
    button("Disconnect Accounts", () => {
      if (!connected || !confirm("Revoke this portal’s Google permissions and disconnect all Google connections?")) return;
      run(async () => { await request("disconnect"); await status(); return "Google confirmed revocation."; });
    }, "danger")
  );
  account.append(connectionInfo, actions, message);
  const cloudHeader = cloud.querySelector(".studio-tab-header");
  const preview = element("details");
  preview.className = "card media-preview media-operation";
  preview.append(element("summary", "More · Publishing request preview"));
  for (const child of [...cloud.children]) {
    if (child !== cloudHeader) preview.append(child);
  }
  cloudHeader.after(account);
  const uploadForm = element("form");
  uploadForm.className = "card";
  const kind = field(uploadForm, "Destination", "kind", "select", [
    ["drive-photo","Google Drive photo"], ["drive-video","Google Drive video"],
    ["youtube-video","YouTube video"], ["youtube-thumbnail","YouTube thumbnail"]
  ]);
  const media = field(uploadForm, "Media file", "media", "file");
  media.required = true;
  const program = field(uploadForm, "Program", "program", "select", [["","Select a Drive program"],["__new","Add new category…"]]);
  const programMessage = element("p");
  programMessage.setAttribute("role", "status");
  program.closest("label").after(programMessage);
  let newProgram = "";
  function setPrograms(names) {
    const previous = program.value;
    program.replaceChildren(new Option("Select a Drive program", ""), ...names.map(name => new Option(name, name)), new Option(newProgram || "Add new category…", "__new"));
    if ([...program.options].some(option => option.value === previous)) program.value = previous;
    feedback(programMessage, "");
    window.setDriveProgramCategories?.(names);
  }
  program.addEventListener("change", () => {
    if (program.value !== "__new") return;
    newProgram = (prompt("New Drive program/category name") || "").trim().slice(0, 120);
    program.options[program.options.length - 1].text = newProgram || "Add new category…";
    if (!newProgram) program.value = "";
  });
  const title = field(uploadForm, "Video title", "title", "text");
  title.maxLength = 100;
  const description = field(uploadForm, "Description", "description", "textarea");
  const visibility = field(uploadForm, "Visibility", "visibility", "select", [["private","Private"],["unlisted","Unlisted"],["public","Public"]]);
  const audience = field(uploadForm, "Audience", "audience", "select", [["","Select audience"],["no","Not made for kids"],["yes","Made for kids"]]);
  const playlist = field(uploadForm, "Playlist", "playlist", "select", [["","No playlist"]]);
  let newPlaylist = "";
  playlist.add(new Option("Add new playlist…", "__new"));
  playlist.addEventListener("change", () => {
    if (playlist.value !== "__new") return;
    newPlaylist = (prompt("New YouTube playlist name (created as Private)") || "").trim().slice(0, 150);
    playlist.options[playlist.options.length - 1].text = newPlaylist || "Add new playlist…";
    if (!newPlaylist) playlist.value = "";
  });
  const thumbnailVideo = field(uploadForm, "Video to update", "videoId", "select", [["","Select video"]]);
  const consent = field(uploadForm, "I confirm I have permission to upload this media", "consent", "checkbox");
  consent.required = true;
  const progress = element("progress");
  progress.max = 100;
  progress.value = 0;
  const submit = element("button", "Upload Media");
  submit.className = "btn btn-primary";
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
  kind.addEventListener("change", async () => {
    updateDestination();
    if (kind.value === "youtube-video" && verifiedConnection?.channel) {
      try { await listYouTube(); }
      catch (error) { feedback(report, error.message, true); }
    }
  });
  uploadForm.addEventListener("reset", () => queueMicrotask(() => {
    updateDestination();
    if (!upload) { progress.value = 0; report.textContent = ""; }
  }));
  uploadForm.append(uploadHint, submit, progress, overlay, report);
  uploadForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (upload || submit.disabled || !uploadForm.reportValidity()) return;
    if (!window.tus?.Upload) { feedback(report, "Resumable-upload library could not load.", true); return; }
    const file = media.files[0];
    if (!file || !consent.checked) return;
    submit.disabled = true;
    submit.textContent = "Processing…";
    progress.value = 0;
    overlay.hidden = false;
    feedback(report, "Preparing private staging…");
    try {
      const staged = await request("stage", {
        kind: kind.value, program: program.value === "__new" ? newProgram : program.value, title: title.value, description: description.value,
        visibility: visibility.value, madeForKids: audience.value === "yes", playlist: playlist.value === "__new" ? "" : playlist.value, playlistName: playlist.value === "__new" ? newPlaylist : "",
        videoId: thumbnailVideo.value, consent: consent.checked, size: file.size, filename: file.name
      });
      await new Promise((resolve, reject) => {
        upload = new window.tus.Upload(file, {
          endpoint: staged.endpoint, headers: { "x-signature": staged.signature },
          chunkSize: 6 * 1024 * 1024, uploadDataDuringCreation: true, storeFingerprintForResuming: false,
          retryDelays: [0, 1000, 3000, 5000, 10000],
          metadata: { bucketName: staged.bucket, objectName: staged.source, contentType: file.type || "application/octet-stream" },
          onProgress: (sent, total) => { progress.value = sent / total * 100; report.textContent = "Staging · " + Math.floor(progress.value) + "%"; },
          onSuccess: resolve, onError: error => {
            const status = error.originalResponse?.getStatus();
            reject(new Error(status ? "Private staging upload failed (HTTP " + status + ")." : "Private staging upload could not reach Supabase Storage."));
          }
        });
        upload.start();
      });
      await request("queue", { id: staged.id });
      lastJob = staged.id;
      activeJobs = true;
      report.textContent = "Queued. The worker will process the watermark and upload to Google.";
      void loadHistory().catch(error => feedback(jobsMessage, error.message, true));
    } catch (error) { feedback(report, error.message, true); }
    finally { upload = null; overlay.hidden = true; submit.textContent = "Upload Media"; updateUploadAvailability(); }
  });
  async function loadHistory() {
    if (loadingJobs) return;
    loadingJobs = true;
    try {
    const data = await request("history");
    activeJobs = data.jobs.some(job => ["queued", "processing"].includes(job.status));
    activity.replaceChildren();
    jobSummary.textContent = "Upload jobs and activity (" + (data.jobs.length + data.events.length) + ")";
    for (const job of data.jobs) {
      const row = element("li", job.request.filename + " · " + job.stage + (job.error ? " · " + job.error : ""));
      if (job.result?.url) row.append(" ", link("Open on Google", job.result.url));
      if (job.result?.visibility) row.append(" · " + job.result.visibility);
      if (job.result?.warning) row.append(" · " + job.result.warning);
      if (job.status === "queued") row.append(" ", button("Cancel Queued Upload", () => {
        if (!confirm("Cancel this queued upload?")) return;
        return run(async () => {
          await request("cancel-queued", { id: job.id });
          await loadHistory();
          return "Queued upload cancelled.";
        }, jobsMessage);
      }, "danger"));
      if (job.status === "failed") row.append(" ", button("Retry", () => run(async () => {
        await request("retry", { id: job.id }); await loadHistory(); return "Upload queued for retry.";
      }, jobsMessage)));
      activity.append(row);
      if (job.id === lastJob) {
        feedback(report, job.status === "done" ? "Successfully uploaded." + (job.result?.warning ? " " + job.result.warning : "") : job.stage + (job.error ? " — " + job.error : ""), Boolean(job.error));
        if (job.status === "done") {
          lastJob = null;
          if (job.request.playlistName) {
            newPlaylist = "";
            playlist.value = "";
            void listYouTube().catch(error => feedback(report, "Successfully uploaded. Playlist refresh failed: " + error.message, true));
          }
          if (job.request.kind.startsWith("drive")) void status().catch(() => {});
        }
      }
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
      if (file.mimeType === "application/vnd.google-apps.folder") row.append(button(file.name, () => run(() => listDrive(file.id), driveMessage)));
      else {
        row.append(link(file.name, file.webViewLink || "https://drive.google.com/open?id=" + file.id), " ",
          button("Move to Trash", () => {
            if (!confirm("Move this Google Drive file to Trash?")) return;
            run(async () => { await request("drive-trash", { id: file.id }); await listDrive(currentFolder); return "Google confirmed the move to Trash."; }, driveMessage);
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
  editSubmit.className = "btn btn-primary";
  editSubmit.type = "submit";
  const editMessage = element("p");
  editMessage.setAttribute("role", "status");
  videoEditor.className = "media-operation";
  videoEditor.prepend(element("h4", "Edit channel video"));
  videoEditor.append(editSubmit, button("Delete Video", () => {
    if (!selected.value || !confirm("Permanently delete this video from the Trust YouTube channel?")) return;
    run(async () => { await request("youtube-delete", { id: selected.value }); await listYouTube(); return "YouTube confirmed deletion."; }, editMessage);
  }), editMessage);
  videoEditor.addEventListener("submit", event => {
    event.preventDefault();
    if (editSubmit.disabled) return;
    editSubmit.disabled = true;
    editSubmit.textContent = "Processing...";
    void run(async () => {
      await request("youtube-edit", { id: selected.value, title: editTitle.value, description: editDescription.value });
      const video = remoteVideos.find(item => item.id === selected.value);
      if (video) {
        video.title = editTitle.value;
        video.description = editDescription.value;
        selected.selectedOptions[0].text = video.title;
      }
      selected.value = editTitle.value = editDescription.value = "";
      return "Successfully updated!";
    }, editMessage).finally(() => {
      editSubmit.disabled = false;
      editSubmit.textContent = "Save YouTube Changes";
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
      if (select === playlist) select.add(new Option(newPlaylist || "Add new playlist…", "__new"));
      if ([...select.options].some(option => option.value === old)) select.value = old;
    }
    selected.dispatchEvent(new Event("change"));
  }
  const youtubeManager = element("fieldset");
  youtubeManager.className = "card media-operation";
  youtubeManager.style.minWidth = "0";
  youtubeManager.append(
    element("legend", "Manage YouTube Videos"),
    button("Load Channel Videos & Playlists", () => run(() => listYouTube(), editMessage)),
    button("Load More Videos", () => videoPage && run(() => listYouTube(videoPage), editMessage)),
    videoEditor
  );
  operations.className = "card";
  const driveBrowser = element("div");
  driveBrowser.className = "card media-operation";
  driveBrowser.append(
    element("h3", "Google Drive Files"),
    element("p", "Browse files and program folders in the configured Media Drive folder."),
    button("Open Root Folder", () => run(() => listDrive(), driveMessage)),
    button("Authorize Drive Folder", () => run(authorizeDriveFolder, driveMessage)),
    button("Load More Files", () => drivePage && run(() => listDrive(currentFolder, drivePage), driveMessage)), driveMessage, files
  );
  const jobs = element("div");
  jobs.className = "card media-operation";
  const jobsHeader = element("div");
  jobsHeader.className = "media-card-header";
  jobsHeader.append(element("h3", "Upload Jobs & Activity"), button("Refresh Jobs", () => run(loadHistory, jobsMessage)));
  jobs.append(jobsHeader, jobsMessage, details);
  operations.append(element("h3", "Media Upload"), uploadForm, driveBrowser, youtubeManager, jobs);
  cloud.append(operations, preview);
  videos.append(button("Open Direct YouTube Upload", () => { go("cloud"); kind.value = "youtube-video"; kind.dispatchEvent(new Event("change")); media.focus(); }));
  $("photos").append(button("Open OAuth Drive Upload", () => { go("cloud"); kind.value = "drive-photo"; updateDestination(); media.focus(); }));
  updateDestination();
  renderConnections();
  setInterval(() => { if (activeJobs && !document.hidden) loadHistory().catch(() => {}); }, 5000);
  document.addEventListener("google-media-ready", () => run(async () => { await status(); await loadHistory(); }), { once: true });
  window.refreshGoogleMedia = tab => {
    if (tab === "accounts") return run(status);
    if (tab === "cloud" || tab === "dashboard") return run(async () => { await status(); await loadHistory(); });
  };
  window.isCloudUploadBusy = () => Boolean(upload);
})();

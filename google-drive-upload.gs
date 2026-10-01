const DEFAULT_PARENT_FOLDER_ID = "1APZJvDJR4d9LGoVGXrMuPlQvO8A1-M0F";
const SOCIAL_ACTIVITY_FOLDER_ID = "1s_N4J6ed4EDn_cj7UpqBb3pDjcA4VAdv";
const DRIVE_TIME_ZONE = "Asia/Kolkata";

function doGet() {
  try {
    const folder = DriveApp.getFolderById(SOCIAL_ACTIVITY_FOLDER_ID);
    const files = listActivityImages_(folder).sort((a, b) => b.getLastUpdated() - a.getLastUpdated());
    const cards = files.map((file) => {
      let thumbnail = null;
      try {
        thumbnail = file.getThumbnail();
      } catch (thumbnailError) {
        thumbnail = null;
      }
      const image = thumbnail || file.getBlob();
      const mimeType = image.getContentType() || file.getMimeType();
      const data = Utilities.base64Encode(image.getBytes());
      return `<figure><img src="data:${escapeHtml_(mimeType)};base64,${data}" alt="${escapeHtml_(file.getName())}" loading="lazy"><figcaption>${escapeHtml_(file.getName())}</figcaption></figure>`;
    }).join("");
    const content = cards || '<p class="empty">No activity photos have been added yet.</p>';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      *{box-sizing:border-box}body{margin:0;padding:12px;background:#f7f8f6;color:#263238;font:15px Arial,sans-serif}
      main{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:14px}
      figure{margin:0;overflow:hidden;border-radius:10px;background:#fff;box-shadow:0 2px 12px #163c2c18}
      img{display:block;width:100%;height:260px;object-fit:cover;background:#e8ede9}
      figcaption{padding:10px 12px;font-size:13px;overflow-wrap:anywhere}
      .empty{grid-column:1/-1;padding:28px;text-align:center;color:#69766e}
    </style></head><body><main>${content}</main></body></html>`;
    return HtmlService.createHtmlOutput(html)
      .setTitle("Sarvahit Trust Activity Photos")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    const html = '<p style="font:16px Arial,sans-serif;color:#5b5147;text-align:center;padding:24px">Activity photos are temporarily unavailable.</p>';
    return HtmlService.createHtmlOutput(html)
      .setTitle("Sarvahit Trust Activity Photos")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

function listActivityImages_(folder) {
  const images = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType().toLowerCase().startsWith("image/")) images.push(file);
  }
  const folders = folder.getFolders();
  while (folders.hasNext()) images.push(...listActivityImages_(folders.next()));
  return images;
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function doPost(event) {
  try {
    const data = JSON.parse(event.postData.contents);
    const parent = DriveApp.getFolderById(DEFAULT_PARENT_FOLDER_ID);
    const now = new Date();
    const year = Utilities.formatDate(now, DRIVE_TIME_ZONE, "yyyy");
    const monthNumber = Utilities.formatDate(now, DRIVE_TIME_ZONE, "MM");
    const day = Utilities.formatDate(now, DRIVE_TIME_ZONE, "dd");
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const month = `${monthNumber}-${monthNames[Number(monthNumber) - 1]}`;
    const yearFolder = getOrCreateFolder_(parent, year);
    const monthFolder = getOrCreateFolder_(yearFolder, month);
    const dateFolder = getOrCreateFolder_(monthFolder, day);
    const bytes = Utilities.base64Decode(data.base64);
    const certificateId = sanitizeFileNamePart_(data.certificateId || "Certificate");
    const fullName = sanitizeFileNamePart_(data.fullName || "Donor");
    const extension = String(data.fileName || "payment-screenshot.jpg").match(/\.([A-Za-z0-9]+)$/);
    const safeName = `${certificateId} - ${fullName}.${extension ? extension[1] : "jpg"}`;
    const blob = Utilities.newBlob(bytes, data.mimeType || "image/jpeg", safeName);
    const file = dateFolder.createFile(blob);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, fileId: file.getId(), fileUrl: file.getUrl(), year, month, day, fileName: safeName }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateFolder_(parent, name) {
  const matchingFolders = parent.getFoldersByName(name);
  return matchingFolders.hasNext() ? matchingFolders.next() : parent.createFolder(name);
}

function sanitizeFileNamePart_(value) {
  return String(value)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "Donor";
}

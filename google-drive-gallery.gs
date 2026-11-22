const DONATION_RECEIPTS_FOLDER_ID = "1APZJvDJR4d9LGoVGXrMuPlQvO8A1-M0F";
const FINANCE_RECEIPTS_FOLDER_ID = "1Fpwk5MeviQfyCpxYg05dDyAlNjwTyq02";
const SUPABASE_PROJECT_URL = "https://oqumyvitsaflllgihlgi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tGTPBACxYOVNqQsQubUeaQ_GII9Q_Jt";
const SOCIAL_ACTIVITY_FOLDER_ID = "1s_N4J6ed4EDn_cj7UpqBb3pDjcA4VAdv";
const YOUTUBE_CHANNEL_ID = "UCArUc8vHzOs3uQyhDwbl5eA";
const DRIVE_TIME_ZONE = "Asia/Kolkata";
const WHATSAPP_CONFIGURED_PHONE_NUMBER_ID = "1476938778837574";
const WHATSAPP_CONFIGURED_SENDER_PHONE = "918459860170";

function doGet(event) {
  const requestId = String(event && event.parameter && event.parameter.galleryRequestId || "");
  const callback = String(event && event.parameter && event.parameter.callback || "");
  try {
    if (event && event.parameter && event.parameter.feed === "videos") {
      return galleryMessage_({ channel: "sarvahit-youtube-videos", requestId: requestId, videos: listYoutubeVideos_() }, callback);
    }
    const folder = DriveApp.getFolderById(SOCIAL_ACTIVITY_FOLDER_ID);
    const rootImages = listActivityImages_(folder);
    const folders = rootImages.length ? [{ name: folder.getName(), images: rootImages }] : [];
    folders.push(...listActivityFolders_(folder));
    folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return galleryMessage_({ channel: "sarvahit-community-gallery", requestId: requestId, folders: folders }, callback);
  } catch (error) {
    return galleryMessage_({ channel: "sarvahit-community-gallery", requestId: requestId, error: String(error && error.message ? error.message : error) }, callback);
  }
}

function listYoutubeVideos_() {
  const response = UrlFetchApp.fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + encodeURIComponent(YOUTUBE_CHANNEL_ID), {
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (response.getResponseCode() !== 200) throw new Error("Could not load the YouTube channel feed.");

  const document = XmlService.parse(response.getContentText());
  const root = document.getRootElement();
  const atom = XmlService.getNamespace("http://www.w3.org/2005/Atom");
  const youtube = XmlService.getNamespace("http://www.youtube.com/xml/schemas/2015");
  const media = XmlService.getNamespace("http://search.yahoo.com/mrss/");
  return root.getChildren("entry", atom).map((entry) => {
    const videoId = entry.getChildText("videoId", youtube);
    if (!videoId) return null;
    const mediaGroup = entry.getChild("group", media);
    const thumbnail = mediaGroup && mediaGroup.getChild("thumbnail", media);
    return {
      id: videoId,
      title: entry.getChildText("title", atom) || "Sarvahit Trust video",
      url: "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId),
      thumbnailUrl: thumbnail && thumbnail.getAttribute("url") ? thumbnail.getAttribute("url").getValue() : "https://i.ytimg.com/vi/" + encodeURIComponent(videoId) + "/hqdefault.jpg"
    };
  }).filter(Boolean);
}

function listActivityImages_(folder) {
  const images = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType().toLowerCase().startsWith("image/")) {
      const id = file.getId();
      images.push({
        name: file.getName(),
        imageUrl: "https://drive.google.com/uc?export=view&id=" + encodeURIComponent(id),
        thumbnailUrl: "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w1200"
      });
    }
  }
  images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return images;
}

function listActivityFolders_(parent) {
  const result = [];
  const folders = parent.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    const images = listActivityImages_(folder);
    if (images.length) result.push({ name: folder.getName(), images: images });
    result.push(...listActivityFolders_(folder));
  }
  return result;
}

function galleryMessage_(payload, callback) {
  const safePayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  if (/^[A-Za-z_$][\w$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + safePayload + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  const html = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script>window.top.postMessage(" + safePayload + ", \"*\");</script></body></html>";
  return HtmlService.createHtmlOutput(html)
    .setTitle("Sarvahit Trust Activity Photos")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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

function authorizeCertificateEmail() {
  return MailApp.getRemainingDailyQuota();
}

function doPost(event) {
  let requestId = "";
  const formTransport = Boolean(event && event.parameter && event.parameter.uploadPayload);
  try {
    const rawPayload = formTransport ? event.parameter.uploadPayload : (event.postData.contents || "{}");
    const data = JSON.parse(rawPayload);
    requestId = String(data.requestId || "");
    const isFinance = data.type === "finance";
    const isCertificate = data.type === "certificate";
    if (!isFinance && !isCertificate && data.type !== "donation") throw new Error("Unsupported upload type.");
    if (isFinance || isCertificate) verifyFinanceAdmin_(data.accessToken);
    if (isCertificate) return uploadResponse_({ ok: true, delivery: sendDonationCertificate_(data.donationId, data.accessToken) }, formTransport, requestId);

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    const mimeType = String(data.mimeType || "application/octet-stream");
    if (!allowedTypes.includes(mimeType)) throw new Error("Only PDF, JPG, PNG or WebP files can be uploaded.");
    if (!data.base64) throw new Error("The selected file is empty.");
    const bytes = Utilities.base64Decode(data.base64);
    if (bytes.length > 8 * 1024 * 1024) throw new Error("The file must be 8 MB or smaller.");

    const parentId = isFinance ? FINANCE_RECEIPTS_FOLDER_ID : DONATION_RECEIPTS_FOLDER_ID;
    const parent = DriveApp.getFolderById(parentId);
    const suppliedDate = String(data.entryDate || data.donationDate || "");
    const dateMatch = suppliedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const savedDate = dateMatch ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), 12)) : new Date();
    const year = Utilities.formatDate(savedDate, DRIVE_TIME_ZONE, "yyyy");
    const month = Utilities.formatDate(savedDate, DRIVE_TIME_ZONE, "MMMM");
    const day = Utilities.formatDate(savedDate, DRIVE_TIME_ZONE, "dd");
    const yearFolder = getOrCreateFolder_(parent, year);
    const monthFolder = getOrCreateFolder_(yearFolder, month);
    const dateFolder = getOrCreateFolder_(monthFolder, day);

    const certificateId = sanitizeFileNamePart_(data.certificateId || (isFinance ? "Expense" : "Donation"));
    const fullName = sanitizeFileNamePart_(data.fullName || data.category || "Record");
    const extension = String(data.fileName || "attachment").match(/\.([A-Za-z0-9]+)$/);
    const suffix = Utilities.formatDate(new Date(), DRIVE_TIME_ZONE, "HHmmss");
    const safeName = certificateId + " - " + fullName + " - " + suffix + "." + (extension ? extension[1] : "bin");
    const file = dateFolder.createFile(Utilities.newBlob(bytes, mimeType, safeName));
    return uploadResponse_({ ok: true, fileId: file.getId(), fileUrl: file.getUrl(), year: year, month: month, day: day, fileName: safeName }, formTransport, requestId);
  } catch (error) {
    return uploadResponse_({ ok: false, error: String(error && error.message ? error.message : error) }, formTransport, requestId);
  }
}

function uploadResponse_(result, formTransport, requestId) {
  if (!formTransport) {
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  const message = JSON.stringify({ channel: "sarvahit-drive-upload", requestId: requestId, result: result }).replace(/</g, "\\u003c");
  const html = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script>window.top.postMessage(" + message + ", \"*\");</script></body></html>";
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function authorizeExternalRequest() {
  UrlFetchApp.fetch("https://www.google.com");
}
function verifyFinanceAdmin_(accessToken) {
  if (!accessToken) throw new Error("Please sign in to upload an expense receipt.");
  const options = {
    method: "get",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true
  };
  const userResponse = UrlFetchApp.fetch(SUPABASE_PROJECT_URL + "/auth/v1/user", options);
  if (userResponse.getResponseCode() !== 200) throw new Error("Admin session expired. Sign in again.");
  const adminOptions = {
    method: "post",
    contentType: "application/json",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + accessToken },
    payload: "{}",
    muteHttpExceptions: true
  };
  const adminResponse = UrlFetchApp.fetch(SUPABASE_PROJECT_URL + "/rest/v1/rpc/is_trust_finance_admin", adminOptions);
  if (adminResponse.getResponseCode() !== 200 || adminResponse.getContentText() !== "true") {
    throw new Error("This account is not authorized to upload finance receipts.");
  }
}

function sendDonationCertificate_(donationId, accessToken) {
  if (!donationId) throw new Error("Donation record ID is missing.");
  const response = UrlFetchApp.fetch(SUPABASE_PROJECT_URL + "/rest/v1/donation_records?id=eq." + encodeURIComponent(donationId) + "&select=id,donor_name,email,phone,amount,purpose,certificate_id,certificate_delivery,payment_status,created_at", {
    method: "get",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error("Could not load the published donation: " + response.getContentText());
  const rows = JSON.parse(response.getContentText() || "[]");
  const donation = rows[0];
  if (!donation || donation.payment_status !== "published") throw new Error("Only a published donation can receive its certificate.");
  const channels = Array.isArray(donation.certificate_delivery) ? donation.certificate_delivery : [];
  if (!channels.length) return { email: "not selected", whatsapp: "not selected" };

  const certificateId = String(donation.certificate_id || "");
  const safeName = sanitizeFileNamePart_(donation.donor_name || "Donor");
  const fileName = "Sarvahit-Certificate-" + sanitizeFileNamePart_(certificateId || donation.id) + ".pdf";
  const html = "<!doctype html><html><head><meta charset=\"utf-8\"><style>body{font-family:Georgia,serif;color:#154c3b;text-align:center;padding:54px;border:10px double #c99b42}h1{font-size:34px;margin:35px 0;color:#154c3b}p{font-size:17px;color:#333}.name{font-size:30px;font-weight:bold;margin:28px 0}.meta{margin-top:30px;font:14px Arial;color:#46534b}</style></head><body><h2>SARVAHIT CHARITABLE TRUST</h2><h1>Certificate of Appreciation</h1><p>This certificate is presented with gratitude to</p><div class=\"name\">" + escapeHtml_(donation.donor_name || "Donor") + "</div><p>for supporting " + escapeHtml_(donation.purpose || "the Trust") + " with a donation of INR " + Number(donation.amount || 0).toLocaleString("en-IN") + ".</p><div class=\"meta\">Certificate ID: " + escapeHtml_(certificateId) + "<br>" + Utilities.formatDate(new Date(donation.created_at || new Date()), DRIVE_TIME_ZONE, "dd MMMM yyyy") + "</div></body></html>";
  const pdf = HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF).setName(fileName);
  const properties = PropertiesService.getScriptProperties();
  const result = {};

  if (channels.includes("email")) {
    const key = "certificate_email_sent_" + donation.id;
    if (properties.getProperty(key)) result.email = "already sent";
    else {
      try {
        const recipient = String(donation.email || "").trim();
        if (!recipient) throw new Error("Donor email address is missing.");
        MailApp.sendEmail(recipient, "Your Sarvahit Charitable Trust certificate", "Thank you for supporting Sarvahit Charitable Trust. Your certificate is attached.", { name: "Sarvahit Charitable Trust", attachments: [pdf.copyBlob()] });
        properties.setProperty(key, new Date().toISOString());
        result.email = "sent";
      } catch (error) { result.email = "failed: " + String(error && error.message ? error.message : error); }
    }
  }

  if (channels.includes("whatsapp")) {
    const key = "certificate_whatsapp_sent_" + donation.id;
    if (properties.getProperty(key)) result.whatsapp = "already sent";
    else {
      try {
        sendWhatsAppCertificate_(donation, pdf, fileName);
        properties.setProperty(key, new Date().toISOString());
        result.whatsapp = "sent";
      } catch (error) { result.whatsapp = "failed: " + String(error && error.message ? error.message : error); }
    }
  }
  return result;
}

function sendWhatsAppCertificate_(donation, pdf, fileName) {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = WHATSAPP_CONFIGURED_PHONE_NUMBER_ID;
  const templateName = properties.getProperty("WHATSAPP_CERTIFICATE_TEMPLATE");
  const senderPhone = WHATSAPP_CONFIGURED_SENDER_PHONE;
  const apiVersion = properties.getProperty("WHATSAPP_GRAPH_API_VERSION") || "v26.0";
  const language = properties.getProperty("WHATSAPP_TEMPLATE_LANGUAGE") || "en";
  if (!token || !templateName || senderPhone !== WHATSAPP_CONFIGURED_SENDER_PHONE) throw new Error("Configure the WhatsApp Cloud API access token and approved certificate template in Apps Script project properties.");
  let recipient = String(donation.phone || "").replace(/\D/g, "");
  if (recipient.length === 10) recipient = "91" + recipient;
  else if (recipient.length === 11 && recipient.charAt(0) === "0") recipient = "91" + recipient.slice(1);
  if (!/^91[0-9]{10}$/.test(recipient)) throw new Error("Donor mobile number must be a valid 10-digit Indian number.");

  const mediaResponse = UrlFetchApp.fetch("https://graph.facebook.com/" + apiVersion + "/" + encodeURIComponent(phoneNumberId) + "/media", {
    method: "post",
    headers: { Authorization: "Bearer " + token },
    payload: { messaging_product: "whatsapp", type: "application/pdf", file: pdf.copyBlob().setName(fileName) },
    muteHttpExceptions: true
  });
  const mediaBody = JSON.parse(mediaResponse.getContentText() || "{}");
  if (mediaResponse.getResponseCode() < 200 || mediaResponse.getResponseCode() >= 300 || !mediaBody.id) throw new Error("WhatsApp certificate upload failed: " + (mediaBody.error && mediaBody.error.message || mediaResponse.getContentText()));

  const messageResponse = UrlFetchApp.fetch("https://graph.facebook.com/" + apiVersion + "/" + encodeURIComponent(phoneNumberId) + "/messages", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ messaging_product: "whatsapp", to: recipient, type: "template", template: { name: templateName, language: { code: language }, components: [{ type: "header", parameters: [{ type: "document", document: { id: mediaBody.id, filename: fileName } }] }] } }),
    muteHttpExceptions: true
  });
  const messageBody = JSON.parse(messageResponse.getContentText() || "{}");
  if (messageResponse.getResponseCode() < 200 || messageResponse.getResponseCode() >= 300 || !messageBody.messages || !messageBody.messages.length) throw new Error("WhatsApp message failed: " + (messageBody.error && messageBody.error.message || messageResponse.getContentText()));
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

const DONATION_RECEIPTS_FOLDER_ID = "1APZJvDJR4d9LGoVGXrMuPlQvO8A1-M0F";
const FINANCE_RECEIPTS_FOLDER_ID = "1Fpwk5MeviQfyCpxYg05dDyAlNjwTyq02";
const SUPABASE_PROJECT_URL = "https://oqumyvitsaflllgihlgi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tGTPBACxYOVNqQsQubUeaQ_GII9Q_Jt";
const SOCIAL_ACTIVITY_FOLDER_ID = "1s_N4J6ed4EDn_cj7UpqBb3pDjcA4VAdv";
const TEAM_PHOTOS_FOLDER_ID = "1ZpSmCwF6E8m6Nl82DWjm1sYqKZtZXZlB";
const TEAM_DUMMY_PHOTO_ID = "1aqi-PePkPXxsiTtBfDP92nyRUzoOeJ5h";
const G80G_CERTIFICATE_FOLDER_ID = "1co07taPYW8aB7xsWvWwwdj6awXly99l3";
const WHATSAPP_CONFIGURED_PHONE_NUMBER_ID = "1476938778837574";
const WHATSAPP_CONFIGURED_SENDER_PHONE = "918459860170";
const DRIVE_TIME_ZONE = "Asia/Kolkata";

function doGet(event) {
  if (event && event.parameter && event.parameter.feed === "team") {
    const requestId = String(event.parameter.galleryRequestId || "");
    const callback = String(event.parameter.callback || "");
    try { return teamFeedMessage_({ channel: "sarvahit-team-photos", requestId: requestId, members: listTeamMembers_() }, callback); }
    catch (error) { return teamFeedMessage_({ channel: "sarvahit-team-photos", requestId: requestId, error: String(error && error.message ? error.message : error) }, callback); }
  }
  try {
    const folder = DriveApp.getFolderById(SOCIAL_ACTIVITY_FOLDER_ID);
    const folders = listActivityFolders_(folder);
    if (!folders.length) {
      const rootImages = listActivityImages_(folder);
      if (rootImages.length) folders.push({ name: "Community Service Programs", images: rootImages });
    }
    return galleryMessage_({ channel: "sarvahit-community-gallery", folders: folders });
  } catch (error) {
    return galleryMessage_({ channel: "sarvahit-community-gallery", error: String(error && error.message ? error.message : error) });
  }
}

function teamFeedMessage_(payload, callback) {
  const safePayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  if (/^[A-Za-z_$][\w$]*$/.test(callback)) return ContentService.createTextOutput(callback + "(" + safePayload + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  const html = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script>window.top.postMessage(" + safePayload + ", \"*\");</script></body></html>";
  return HtmlService.createHtmlOutput(html).setTitle("Sarvahit Trust Team").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
  const childFolders = folder.getFolders();
  while (childFolders.hasNext()) images.push(...listActivityImages_(childFolders.next()));
  images.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }); });
  return images;
}

function listActivityFolders_(parent) {
  const result = [];
  const folders = parent.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    const images = listActivityImages_(folder);
    if (images.length) result.push({ name: folder.getName(), images: images });
  }
  return result;
}

function galleryMessage_(payload) {
  const safePayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script>window.parent.postMessage(" + safePayload + ", \"*\");</script></body></html>";
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

function doPost(event) {
  let requestId = "";
  const formTransport = Boolean(event && event.parameter && event.parameter.uploadPayload);
  try {
    const rawPayload = formTransport ? event.parameter.uploadPayload : (event.postData.contents || "{}");
    const data = JSON.parse(rawPayload);
    requestId = String(data.requestId || "");
    const isFinance = data.type === "finance";
    const isCertificate = data.type === "certificate";
    const is80GCertificate = data.type === "80g_certificate";
    const isTeamRequest = data.type === "team_list" || data.type === "team_save";
    if (!isFinance && !isCertificate && !is80GCertificate && !isTeamRequest && data.type !== "donation") throw new Error("Unsupported upload type.");
    if (isFinance || isCertificate || is80GCertificate || isTeamRequest) verifyFinanceAdmin_(data.accessToken);
    if (data.type === "team_list") return uploadResponse_({ ok: true, members: listTeamMembers_(data.accessToken) }, formTransport, requestId);
    if (data.type === "team_save") return uploadResponse_({ ok: true, member: saveTeamMember_(data) }, formTransport, requestId);
    if (isCertificate) return uploadResponse_({ ok: true, delivery: sendDonationCertificate_(data.donationId, data.accessToken) }, formTransport, requestId);
    if (is80GCertificate) return uploadResponse_({ ok: true, ...saveAndSend80GCertificate_(data) }, formTransport, requestId);

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

function defaultTeamMembers_() {
  const designations = ["Founder & President", "Secretary", "Treasurer", "Trustee", "Trustee", "Trustee", "Trustee", "Trustee", "Trustee", "Trustee", "Trustee"];
  return designations.map(function (designation, index) {
    return { designation: designation, name: index === 0 ? "Harshal Prakash Wani" : "", photoId: "", photoName: "" };
  });
}

function readTeamMembers_(accessToken) {
  const folder = DriveApp.getFolderById(TEAM_PHOTOS_FOLDER_ID);
  const members = defaultTeamMembers_();
  const token = accessToken || SUPABASE_PUBLISHABLE_KEY;
  const response = UrlFetchApp.fetch(SUPABASE_PROJECT_URL + "/rest/v1/trust_team_members?select=member_position,designation,name,photo_file_id,photo_file_name&order=member_position.asc", {
    method: "get",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error("Could not load team profiles from Supabase: " + response.getContentText());
  const rows = JSON.parse(response.getContentText() || "[]");
  rows.forEach(function (row) {
    const index = Number(row.member_position);
    if (!Number.isInteger(index) || index < 0 || index > 10) return;
    members[index] = { designation: String(row.designation || members[index].designation), name: String(row.name || ""), photoId: String(row.photo_file_id || ""), photoName: String(row.photo_file_name || "") };
  });
  if (!rows.length) {
    const photos = listActivityImages_(folder);
    photos.slice(0, members.length).forEach(function (photo, index) {
      const match = String(photo.imageUrl || "").match(/[?&]id=([^&]+)/);
      if (match) { members[index].photoId = decodeURIComponent(match[1]); members[index].photoName = photo.name || ""; }
    });
    if (accessToken) saveTeamMemberRecords_(members, accessToken);
  }
  return members;
}

function publicTeamMembers_(members) {
  return members.map(function (member) {
    const displayPhotoId = member.photoId || TEAM_DUMMY_PHOTO_ID;
    return {
      designation: member.designation,
      name: member.name,
      photoId: member.photoId,
      photoName: member.photoName,
      photoIsDummy: !member.photoId,
      imageUrl: "https://drive.google.com/uc?export=view&id=" + encodeURIComponent(displayPhotoId),
      thumbnailUrl: "https://drive.google.com/thumbnail?id=" + encodeURIComponent(displayPhotoId) + "&sz=w1200"
    };
  });
}

function listTeamMembers_(accessToken) {
  return publicTeamMembers_(readTeamMembers_(accessToken));
}

function saveTeamMember_(data) {
  const index = Number(data.memberIndex);
  if (!Number.isInteger(index) || index < 0 || index > 10) throw new Error("Choose a valid team profile.");
  const designation = String(data.designation || "").trim();
  const name = String(data.name || "").trim();
  if (!designation || designation.length > 80 || !name || name.length > 100) throw new Error("Enter a designation (up to 80 characters) and name (up to 100 characters).");
  const members = readTeamMembers_(data.accessToken);
  const member = members[index];
  const folder = DriveApp.getFolderById(TEAM_PHOTOS_FOLDER_ID);
  const oldPhotoId = member.photoId;
  let newPhoto = null;

  if (data.removePhoto) {
    member.photoId = "";
    member.photoName = "";
  } else if (data.base64) {
    const mimeType = String(data.mimeType || "");
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("Only JPG, PNG, or WebP team photos are allowed.");
    const bytes = Utilities.base64Decode(data.base64);
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Each team photo must be 8 MB or smaller.");
    const extension = String(data.fileName || "photo.jpg").match(/\.([A-Za-z0-9]+)$/);
    const safeName = "team-" + String(index + 1).padStart(2, "0") + "-" + sanitizeFileNamePart_(name) + "." + (extension ? extension[1].toLowerCase() : "jpg");
    newPhoto = folder.createFile(Utilities.newBlob(bytes, mimeType, safeName));
    try { newPhoto.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (error) { newPhoto.setTrashed(true); throw new Error("Could not make the new photo visible to the website: " + String(error.message || error)); }
    member.photoId = newPhoto.getId();
    member.photoName = newPhoto.getName();
  }

  member.designation = designation;
  member.name = name;
  try {
    saveTeamMemberRecord_(member, index, data.accessToken);
  } catch (error) {
    if (newPhoto) newPhoto.setTrashed(true);
    throw error;
  }
  if ((data.removePhoto || newPhoto) && oldPhotoId && oldPhotoId !== member.photoId) DriveApp.getFileById(oldPhotoId).setTrashed(true);
  return publicTeamMembers_(members)[index];
}

function saveTeamMemberRecord_(member, index, accessToken) {
  saveTeamMemberRecords_([member], accessToken, [index]);
}

function saveTeamMemberRecords_(members, accessToken, positions) {
  const records = members.map(function (member, offset) {
    const index = positions ? positions[offset] : offset;
    return { member_position: index, designation: member.designation, name: member.name || "", photo_file_id: member.photoId || null, photo_file_name: member.photoName || null, updated_at: new Date().toISOString() };
  });
  const response = UrlFetchApp.fetch(SUPABASE_PROJECT_URL + "/rest/v1/trust_team_members?on_conflict=member_position", {
    method: "post",
    contentType: "application/json",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + accessToken, Prefer: "resolution=merge-duplicates,return=representation" },
    payload: JSON.stringify(records),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error("Could not save team profiles to Supabase: " + response.getContentText());
}

function saveAndSend80GCertificate_(data) {
  if (!data.donationId || !data.base64) throw new Error("Donation and certificate file are required.");
  const bytes = Utilities.base64Decode(data.base64);
  if (bytes.length > 8 * 1024 * 1024) throw new Error("The certificate must be 8 MB or smaller.");
  const mimeType = String(data.mimeType || "application/pdf");
  if (mimeType !== "application/pdf") throw new Error("Upload the 80G certificate as a PDF.");
  const isLedgerDonation = data.sourceType === "ledger";
  const table = isLedgerDonation ? "trust_financial_entries" : "donation_records";
  const fields = isLedgerDonation
    ? "id,entry_type,donor_name,donor_email,donor_phone,amount,category,workflow_status,entry_date,created_at"
    : "id,donor_name,pan_card_number,email,phone,amount,purpose,certificate_id,certificate_delivery,certificate_delivery_status,payment_status,created_at";
  const response = UrlFetchApp.fetch(SUPABASE_PROJECT_URL + "/rest/v1/" + table + "?id=eq." + encodeURIComponent(data.donationId) + "&select=" + fields, {
    method: "get", headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + data.accessToken }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error("Could not load donation: " + response.getContentText());
  const donation = (JSON.parse(response.getContentText() || "[]"))[0];
  if (isLedgerDonation) {
    if (!donation || donation.entry_type !== "donation" || donation.workflow_status !== "published" || Number(donation.amount) < 4999) {
      throw new Error("80G certificates are available only for published ledger donations of INR 4,999 or more.");
    }
    donation.email = String(donation.donor_email || "").trim();
    donation.phone = donation.donor_phone || "";
    donation.purpose = donation.category || "Donation";
    donation.pan_card_number = "";
    donation.certificate_id = "Manual-" + donation.id;
    if (!donation.email) throw new Error("Add a donor email address before sending the 80G certificate.");
  } else {
    if (!donation || donation.payment_status !== "published" || Number(donation.amount) < 4999) throw new Error("80G certificates are available only for published donations of INR 4,999 or more.");
    const appreciationChannels = Array.isArray(donation.certificate_delivery) ? donation.certificate_delivery : [];
    const appreciationStatus = donation.certificate_delivery_status || {};
    if (!appreciationChannels.length || !appreciationChannels.every((channel) => ["sent", "already sent"].includes(String(appreciationStatus[channel] || "").toLowerCase()))) {
      throw new Error("Send the Appreciation Certificate through the donor's selected channels before sending the 80G certificate.");
    }
    if (!appreciationChannels.some((channel) => channel === "email" || channel === "whatsapp")) throw new Error("The donor did not select an email or WhatsApp delivery option.");
  }
  const channels = isLedgerDonation ? ["email"] : donation.certificate_delivery;
  const now = new Date();
  const year = Utilities.formatDate(now, DRIVE_TIME_ZONE, "yyyy");
  const month = Utilities.formatDate(now, DRIVE_TIME_ZONE, "MMMM");
  const day = Utilities.formatDate(now, DRIVE_TIME_ZONE, "dd");
  const parent = DriveApp.getFolderById(G80G_CERTIFICATE_FOLDER_ID);
  const dateFolder = getOrCreateFolder_(getOrCreateFolder_(getOrCreateFolder_(parent, year), month), day);
  const donorFolderName = sanitizeFileNamePart_(donation.donor_name || "Donor") + " (" + sanitizeFileNamePart_(donation.pan_card_number || "PAN not provided") + ")";
  const donorFolder = getOrCreateFolder_(dateFolder, donorFolderName);
  const requestedFileName = sanitizeFileNamePart_(data.fileName || "80G-Certificate.pdf");
  const safeName = requestedFileName.toLowerCase().endsWith(".pdf") ? requestedFileName : requestedFileName + ".pdf";
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const file = donorFolder.createFile(blob);
  const delivery = {};
  if (channels.includes("email")) {
    try {
      const recipient = String(donation.email || "").trim();
      if (!recipient) throw new Error("Donor email address is missing.");
      MailApp.sendEmail(recipient, "Your 80G certificate from Sarvahit Charitable Trust", "Thank you for supporting Sarvahit Charitable Trust. Your 80G certificate is attached.", { name: "Sarvahit Charitable Trust", attachments: [blob.copyBlob()] });
      delivery.email = "sent";
    } catch (error) { delivery.email = "failed: " + String(error.message || error); }
  }
  if (channels.includes("whatsapp")) {
    try { sendWhatsAppCertificate_(donation, blob, safeName); delivery.whatsapp = "sent"; }
    catch (error) { delivery.whatsapp = "failed: " + String(error.message || error); }
  }
  return { fileId: file.getId(), fileUrl: file.getUrl(), year: year, month: month, day: day, delivery: delivery };
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
function authorizeCertificateEmail() {
  return MailApp.getRemainingDailyQuota();
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
  const response = UrlFetchApp.fetch(SUPABASE_PROJECT_URL + "/rest/v1/donation_records?id=eq." + encodeURIComponent(donationId) + "&select=id,donor_name,pan_card_number,email,phone,amount,purpose,certificate_id,certificate_delivery,payment_status,created_at", {
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
  const logoBlob = DriveApp.getFileById("1I_lCkSE4CkeuXxuXMg8KVJZI_jCKUKDu").getBlob();
  const logoData = "data:" + (logoBlob.getContentType() || "image/png") + ";base64," + Utilities.base64Encode(logoBlob.getBytes());
  const certificateDate = Utilities.formatDate(new Date(donation.created_at || new Date()), DRIVE_TIME_ZONE, "dd MMMM yyyy");
  const donorNameText = String(donation.donor_name || "Donor");
  const donorName = escapeHtml_(donorNameText);
  const donorNameFontSize = Math.max(16, Math.min(28, Math.floor(28 * 42 / Math.max(42, donorNameText.length))));
  const purpose = escapeHtml_(donation.purpose || "our charitable work");
  const amount = Number(donation.amount || 0).toLocaleString("en-IN");
  const pan = escapeHtml_(donation.pan_card_number || "Not provided");
  const html = "<!doctype html><html><head><meta charset=\"utf-8\"><style>"
    + "@page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{width:297mm;height:210mm;margin:0;padding:0}body{position:relative;overflow:hidden;background:#fffaf4;color:#4b504c;font-family:Arial,sans-serif;text-align:center;page-break-after:avoid;page-break-inside:avoid}"
    + ".frame{position:absolute;inset:10mm;border:2.2mm solid #1c5c37;pointer-events:none}.frame:after{content:'';position:absolute;inset:4mm;border:.8mm solid #c4912d}.watermark{position:absolute;width:130mm;height:130mm;object-fit:contain;left:50%;top:61mm;transform:translateX(-50%);opacity:.24;z-index:0}.logo{position:absolute;top:17mm;left:50%;transform:translateX(-50%);width:26mm;height:26mm;object-fit:contain}.trust-title{position:absolute;top:41mm;left:15mm;right:15mm;margin:0;color:#1c5c37;font:700 24pt Arial,sans-serif;letter-spacing:.5pt}.certificate-title{position:absolute;top:58mm;left:16mm;right:16mm;margin:0;color:#c4912d;font:700 29pt Arial,sans-serif;letter-spacing:.6pt}.presented{position:absolute;top:80mm;left:15mm;right:15mm;margin:0;font:14pt Arial,sans-serif}.donor-name{position:absolute;top:96mm;left:28mm;right:28mm;overflow:hidden;color:#1c5c37;font:italic 700 " + donorNameFontSize + "pt Georgia,serif;line-height:1.05;white-space:nowrap}.name-rule{position:absolute;top:112mm;left:72mm;right:72mm;border-top:.6mm solid #c4912d}.thanks,.amount,.purpose,.mission{position:absolute;left:15mm;right:15mm;margin:0;font-family:Arial,sans-serif}.thanks{top:121mm;font-size:13pt}.amount{top:133mm;font-size:13pt;font-weight:700}.purpose{top:144mm;font-size:13pt}.mission{top:156mm;font-size:12pt}.meta{position:absolute;top:170mm;left:30mm;right:30mm;display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;gap:4mm;color:#46504a;font:10.5pt Arial,sans-serif;white-space:nowrap}.date{position:absolute;top:169mm;left:30mm;width:30%;text-align:left;color:#46504a;font:10.5pt Arial,sans-serif;white-space:nowrap}.pan{position:absolute;top:183mm;left:30mm;width:30%;text-align:left;color:#46504a;font:700 11pt Arial,sans-serif;white-space:nowrap}.email{position:absolute;top:183mm;left:50%;right:auto;transform:translateX(-50%);text-align:center;color:#1c5c37;font:11pt Arial,sans-serif;white-space:nowrap}"
    + "</style></head><body><div class=\"frame\"></div><img class=\"watermark\" src=\"" + logoData + "\"><img class=\"logo\" src=\"" + logoData + "\"><h2 class=\"trust-title\">SARVAHIT CHARITABLE TRUST</h2><h1 class=\"certificate-title\">CERTIFICATE OF APPRECIATION</h1><p class=\"presented\">This certificate is proudly presented to</p><div class=\"donor-name\">" + donorName + "</div><div class=\"name-rule\"></div><p class=\"thanks\">With sincere gratitude for your generous support.</p><p class=\"amount\">Donation Amount: INR " + amount + "</p><p class=\"purpose\">Towards " + purpose + ".</p><p class=\"mission\">Your support strengthens our mission to serve people and communities in need.</p><div class=\"meta\"><span></span><span>Certificate ID: " + escapeHtml_(certificateId) + "</span><span>Authorized by Sarvahit Charitable Trust</span></div><div class=\"date\">Date: " + escapeHtml_(certificateDate) + "</div><div class=\"pan\">PAN: " + pan + "</div><div class=\"email\">sarvahitcharitabletrust2026@gmail.com</div></body></html>";
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

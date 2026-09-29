const DEFAULT_PARENT_FOLDER_ID = "1jzejKzt8VYQzXAXURxSBr7_fLSqfwpV6";

function doPost(event) {
  try {
    const data = JSON.parse(event.postData.contents);
    const parent = DriveApp.getFolderById(data.parentFolderId || DEFAULT_PARENT_FOLDER_ID);
    const year = String(data.year || new Date().getFullYear());
    const folders = parent.getFoldersByName(year);
    const yearFolder = folders.hasNext() ? folders.next() : parent.createFolder(year);
    const bytes = Utilities.base64Decode(data.base64);
    const blob = Utilities.newBlob(bytes, data.mimeType || "image/jpeg", data.fileName);
    const file = yearFolder.createFile(blob);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, fileId: file.getId(), fileUrl: file.getUrl(), year }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

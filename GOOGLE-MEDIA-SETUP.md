# Sarvahit Media Google integration

## Deployment and callback

Deploy the existing site with this directory as the Vercel source root. Retain the api/google and server directory names. Use a Vercel project that runs Node.js Functions. Register the following path on the **production origin serving admin.html** in Google Cloud as an Authorized redirect URI.

    https://YOUR-PRODUCTION-DOMAIN/api/google/callback

If your production alias is sarvahitcharitabletrust.vercel.app, the exact value is:

    https://sarvahitcharitabletrust.vercel.app/api/google/callback

Confirm the alias in Vercel before saving it. Set GOOGLE_REDIRECT_URI to the same full URI. Use the production origin when opening Admin, as the OAuth state cookie is host-bound.

Enable Google Drive API, YouTube Data API v3 and YouTube Analytics API. Configure Google Auth Platform branding, audience, data access, and a Web application OAuth client. Add the Trust account as a test user if the external app is in Testing. Add these permissions in Data Access and authorize all when prompted.

    https://www.googleapis.com/auth/drive.file
    https://www.googleapis.com/auth/youtube.force-ssl
    https://www.googleapis.com/auth/yt-analytics.readonly

The code additionally requests openid and email to display the verified Google account. Approve consent using the Google account and YouTube channel that owns UCArUc8vHzOs3uQyhDwbl5eA. Do not paste OAuth secrets in chat or into the HTML.

## Environment and database

In the Supabase SQL Editor, run the complete supabase-all-in-one.sql for a fresh or existing installation. It includes the website schema, separate Google media connections and private staging bucket.

Set these values in Vercel Project Settings > Environment Variables, and redeploy.

| Variable | Value |
| --- | --- |
| GOOGLE_CLIENT_ID | Web application OAuth client ID |
| GOOGLE_CLIENT_SECRET | Its client secret |
| GOOGLE_REDIRECT_URI | Exact production callback registered in Google Cloud |
| GOOGLE_DRIVE_FOLDER_ID | 1s_N4J6ed4EDn_cj7UpqBb3pDjcA4VAdv, or the authorized replacement root |
| GOOGLE_YOUTUBE_CHANNEL_ID | UCArUc8vHzOs3uQyhDwbl5eA, also the code default |
| SUPABASE_URL | https://oqumyvitsaflllgihlgi.supabase.co |
| SUPABASE_ANON_KEY | Existing Supabase publishable/anon key |
| SUPABASE_SERVICE_ROLE_KEY | Existing Supabase service-role secret |
| SUPABASE_TUS_URL | https://oqumyvitsaflllgihlgi.storage.supabase.co/storage/v1/upload/resumable |
| MEDIA_TOKEN_ENCRYPTION_KEY | Random 32-byte secret encoded as 64 hex characters |
| MEDIA_VIDEO_LIMIT_MB | Optional. Default 512. Choose a size supported by the project and worker |

Generate MEDIA_TOKEN_ENCRYPTION_KEY locally with Node or your secret manager. The Vercel backend and the worker must use the same value. Reauthorizing accounts is necessary if the encryption key changes without migrating saved ciphertext.

## Upgrade from the combined Google Connect flow

Run supabase-all-in-one.sql as described above before deploying.
Redeploy the complete outputs directory to the existing Vercel production project. The backend selects the scope for each connection automatically.
Open the published admin.html and use Connect Google Drive, Connect YouTube Channel and Connect YouTube Analytics separately. An approval URL containing all media scopes together is from the previous flow.

## Worker

Deploy one always-on container or VM runner to a host that allows outbound HTTPS to Supabase and Google. Give it disk space for staged inputs plus processed outputs. From this source root build with:

    docker build -f MediaWorker.Dockerfile -t sarvahit-media-worker .

Configure these runtime secrets on the runner: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MEDIA_TOKEN_ENCRYPTION_KEY and GOOGLE_DRIVE_FOLDER_ID. Set GOOGLE_YOUTUBE_CHANNEL_ID if using a non-default test channel. Mount the original Trust logo from the user's approved Google Drive watermark file as a read-only file and set MEDIA_WATERMARK_FILE to that path. The image uses FFmpeg. The worker applies a bottom-right 40% logo on photos and videos and re-encodes existing video audio to AAC. A video without audio remains silent.

The browser stages media directly to private Supabase Storage via a path-limited signed TUS upload. Vercel does not proxy the video bytes. The worker uploads to Drive and YouTube using Google's resumable protocol. If Google might have accepted a file but confirmation is missing, the job enters Check destination to avoid publishing duplicates. Inspect Google and the queue before restarting a job left Processing after a worker crash. Queue execution, disk, Supabase plan limits and provider quotas must be validated with expected production file sizes.

## Provider checks

- Test Google connection in Cloud Publishing. A successful Google login is separate from Drive, YouTube Channel and Analytics verification. A wrong YouTube channel is shown as unverified and cannot publish through the portal.
- drive.file is per-file access. Existing shared folder membership alone may not grant this OAuth client access to a pre-existing folder. The status check calls Drive files.get and checks canAddChildren. If Drive returns 403/404, authorize the target using an approved Google Picker or Open with workflow for this OAuth project, or configure a folder created by that same app through Drive. This delivery does not include a Picker or folder-adoption flow. Keep existing Apps Script uploads available independently.
- Before sharing live videos, test a small private video and confirm its result in YouTube Studio. YouTube may restrict uploads from an unverified API project to Private even if another visibility is selected. OAuth app verification and YouTube API compliance audit are separate. External Testing refresh tokens may expire after seven days.
- Check both a small Drive photo and a video with audio. Confirm the Year / Program folder, visual watermark placement, audio, media list and Trash action. Test video edit, playlist, thumbnail and analytics on test assets. Only delete a video deliberately created for the test.
- Drive and YouTube lists support loading more files/videos. The playlist selector shows the first 50 owned playlists.
- Successful staged files are removed by the worker. Configure operational cleanup for abandoned staging jobs and their private objects. The worker currently has a retry option for definite failures and a review state for uncertain remote outcomes. Cross-worker folder creation is designed for one worker instance.

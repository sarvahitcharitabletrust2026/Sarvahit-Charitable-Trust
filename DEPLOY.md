# Sarvahit OAuth scope fix

1. Finish or pause existing uploads. Stop the old media worker before switching the admin portal to the new code.
2. Copy the JavaScript files to the same paths in the existing repository. Keep the existing callback.js and other project files. The worker file belongs in server/, as expected by MediaWorker.Dockerfile.
3. Run the complete supabase-all-in-one.sql in the existing Supabase project SQL Editor. It includes the separate media connections and prior website migrations.
4. Keep the current GOOGLE_REDIRECT_URI and encryption key. Commit and deploy the updated Portal to Production. Rebuild and restart the media worker with its existing environment variables.
5. In Cloud Publishing, use Connect Google Drive, Connect YouTube Channel for uploads and edits, and Connect YouTube Analytics for Dashboard metrics. Approve each consent separately, then click Refresh Status. Existing grants from the earlier single-flow version are not reused. Restage any pending uploads created before the update.
6. Verify the Drive folder, Trust YouTube channel and analytics statuses. If an existing Drive folder returns an access error after consent, drive.file requires that the app be granted access to that specific folder (for example via Google Picker) or that the configured folder was created by the app. Test a private upload after the worker is ready.

Deploy and test against your production Google account and configured Trust channel. No provider access was verified against production from this workspace.

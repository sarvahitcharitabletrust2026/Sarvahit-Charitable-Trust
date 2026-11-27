# Sarvahit website continuation notes

## Current files
- Homepage: outputs/index.html (saved version 14).
- Admin and Trust Portal: outputs/admin.html (saved version 3), outputs/trust-portal.css, and outputs/reset-password.html.
- Volunteer: outputs/volunteer.html (saved version 3).
- Shared public location dropdowns: outputs/public-location-fields.js (saved version 2).
- Database: outputs/supabase-all-in-one.sql (includes volunteer and donation state, country, and PIN Code fields).
- YouTube and community gallery: outputs/google-drive-gallery.gs. Partner Drive uploads: outputs/google-drive-upload.gs.

## Latest updates
- Volunteer and Donation forms require all information fields. Their location dropdowns use Country → State → City, default to India, and sort options A–Z. PIN Code accepts digits. Retry locations button removed.
- Donation Report shows City only for location. Clicking City opens stored City, State, Country, and PIN Code. Older entries may lack some fields.
- Trust Portal Login labels Email ID and Password are bold. Entered email text is regular. The eye icon toggles password visibility. Forgot Password is an email-only popup with a blurred backdrop and close button.
- Homepage About, Blog, Partners, Contact, and Donation backgrounds use the light green tint. Partner, core team, and contact cards have a distinct white background, green border, and shadow.
- Videos have a clickable counter, thumbnail-only gallery, and on-page player popup. The complete channel list requires YOUTUBE_DATA_API_KEY in the Gallery Apps Script and an updated deployment.

## Pending live checks
- Supabase screenshot showed the live site URL and reset-password.html redirect configured. Password reset requests hit HTTP 429. Custom SMTP was discussed; setup and successful live email delivery are unverified.
- YouTube playback needs verification from the deployed HTTP(S) site. Local file preview cannot provide a web referrer.
- Confirm the latest address migration has been applied in Supabase and the updated web files are deployed before testing production submission.

## Delivery preference
Keep website changes as individual files in outputs. Do not create or recreate the website ZIP.

## Continuation checkpoint — 27 November 2026

This checkpoint supersedes earlier notes where they differ. Continue from the existing files in outputs instead of reconstructing the site.

- Admin dashboard: Open/Close controls are available only for the literal admin role. Other roles see their authorized sections directly. Admin states persist through report auto-refresh and same-tab reload. Closed expense and donation reports show unpublished records within the selected period. Open shows the full filtered table. Leadership, Partners, Volunteer Data and Trusted Person Reviews show count inside the toggle and keep section notes visible. Expense/Donation action buttons stay in one horizontal row inside scrollable tables.
- Donation Report: City was removed from the table. Donor Details contains contact and saved address. Excel exports all donation records with one Full Address column, 80G status only, and without Screenshot or Actions. Donation, Expense and Volunteer Excel exports share yellow bold headers and bordered cells.
- Homepage: Donate Now stays visible while mobile navigation scrolls. Get Involved is a tap disclosure. The three-dot finance reports use published data and default to the current India month. Donation Purpose is required and includes Tree Plantations.
- Media Studio: 12 tabs with top-right Refresh and Clear where applicable. Program and history lists scroll internally. History can be filtered by day, month and year. Programs use Country, State and City dropdowns with India as default. Drive program folders are listed in a collapsible control. YouTube appears as a dashboard count. Photo watermark is optional and defaults on. Slideshow generation is available for Story / Reel, includes transitions and FX, and requires a playable preview before download. Media Library cards keep Delete local at the bottom.
- Marathi guide: outputs/Sarvahit_Media_Studio_Marathi_Guide.docx documents all 12 tabs and their workflows. The document structure and Marathi content were verified. Page-by-page visual render remained pending in this environment.
- Google Media integration: admin.html loads media-google-admin.js. Keep api/google/action.js, api/google/callback.js, server/google-media.cjs, server/google-media-worker.cjs and MediaWorker.Dockerfile in their existing locations. The Google OAuth and Media Studio migration is at the end of supabase-all-in-one.sql. The standalone media-google-migration.sql was removed locally. See GOOGLE-MEDIA-SETUP.md for deployment.
- Pending live checks: latest hosted Admin deployment, real slideshow playback/download, Drive photo upload and default logo retrieval using the latest Apps Script, and browser layout. Google OAuth setup still needs the confirmed production callback hostname, provider credentials and consent, Supabase migration, worker deployment, and real upload/Analytics verification. Apps Script Version 33 was previously deployed on the web-app URL then in use. Later logo changes and the exact endpoint used by the current Admin must be checked before assuming live availability.

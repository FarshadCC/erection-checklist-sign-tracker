SPAN ERECTION WEB APP — IN-APP PDF PREVIEW & SIGNATURES
=======================================================

PACKAGE CONTENTS
- index.html
- script.js
- style.css

WHAT CHANGED
- Replaced the old spanerection:// Windows PDF opener with an in-app PDF viewer.
- PDFs open inside the current SPAN tab; no new tab, PowerShell, VBScript, or Windows helper is used.
- Added page-by-page rendering in a scrollable viewer, zoom, previous/next page navigation.
- Added personal signature settings with Draw, Type Name, and Upload PNG/JPG options.
- Personal signatures are stored locally in the browser and separated by the signed-in SPAN username.
- Added click-to-place signature and date, drag-to-move, resize handles, remove controls, and double-click date editing.
- Save to Original writes the flattened signature/date into the same PDF file handle, retaining its original filename and folder.
- Added a short auto-dismissing success/error toast.
- Existing login, folder handles, checklist processing, inspector management, Supabase activity log, and workflow UI were retained.

IMPORTANT REQUIREMENTS
1. Use Microsoft Edge or Google Chrome.
2. Run the app from HTTPS (Netlify) or localhost. Do not open index.html directly using file://.
3. Internet access is required because PDF.js and pdf-lib are loaded from public CDNs.
4. The browser must support the File System Access API. Current desktop Edge/Chrome support this.
5. When prompted, grant read/write access to the Draft folder/file.
6. Test with copies of PDFs first. Save to Original overwrites the selected original PDF after creating the signed output.

TESTING BEFORE NETLIFY
1. Extract the ZIP into a new folder. Do not overwrite your currently working app.
2. Open the extracted folder in VS Code.
3. Start it using Live Server (localhost) or another local HTTPS server.
4. Sign in and select the Draft, Revision Required, and Approved folders.
5. Click Refresh List.
6. Click a PDF link. It should open inside the same tab.
7. Open My Signature and test Draw, Type Name, and Upload. Save one personal signature.
8. Click Add Signature, click a location on a PDF page, then move/resize it. Use the small x control to remove a placement if needed.
9. Click Add Date and place it. Double-click the date to edit it.
10. Click Save to Original. Close and reopen the PDF to confirm the signature/date is embedded and the filename/location are unchanged.
11. Test a multi-page PDF, zoom, page navigation, and a long filename.
12. Test Approve and Revision Required separately using disposable test PDFs and confirm Activity Log entries and TXT comment files.

IMPORTANT LIMITATIONS
- This is a visual/electronic signature image embedded into the PDF, not a certificate-based cryptographic digital signature.
- Saving overwrites the original PDF. Keep backups during testing.
- If a PDF is password-protected/encrypted, uses unsupported special forms, is locked by another program, or OneDrive is not ready to sync, the PDF library/browser may refuse to save it. The app will show an error instead of reporting success.
- PDF.js/pdf-lib are loaded from CDN, so the first viewer load needs internet access.
- Browser file access permissions are stored per browser profile/device. Each user/device must select its own folders and grant access.
- The app's existing client-side username/password login is unchanged and is not strong server-side authentication.

NO SUPABASE DATABASE CHANGES ARE REQUIRED FOR THE PDF VIEWER.
The existing Supabase project/tables and current app configuration are retained.

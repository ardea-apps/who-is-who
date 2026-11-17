# Who's who

Static page (GitHub Pages) + Google Apps Script backend storing names in a Google Sheet.

1. Create a Google Sheet, open Extensions > Apps Script, paste `Code.gs`, set `PASSPHRASE`.
2. Deploy > New deployment > Web app > Execute as: Me, Access: Anyone. Copy the `/exec` URL.
3. In `index.html` set `API_URL` to that URL.
4. Commit this folder to a GitHub repo and enable Pages (Settings > Pages > main branch).
5. Share the page link and the passphrase with the group.

Names are in the Sheet's `Log` tab (append-only history; latest row per number wins).

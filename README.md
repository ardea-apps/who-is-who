# Who's who

A numbered class photo where a group fills in names, plus a view-only page.
Static pages on GitHub Pages with a Google Apps Script backend that stores
names in a Google Sheet.

## Files

| File | Purpose |
|---|---|
| `index.html` | Editing page. Needs the group passphrase. Names, and optional recent photos, can be added per number. |
| `view.html` | Read-only page, no passphrase. Can be switched off in `Code.gs`. |
| `Code.gs` | Apps Script backend (paste into the Sheet's script editor). |
| `class.jpg` | The numbered class photo. |
| `faces/01.jpg` ... `faces/40.jpg` | Cropped "then" face for each number. |

## Setup

1. Create a Google Sheet, open Extensions > Apps Script, paste `Code.gs`, and
   set `PASSPHRASE` (the repo copy holds the placeholder `CHANGE_ME`; never
   commit the real one).
2. Run the `authorize` function once and accept the permissions. It creates the
   `Log` and `Photos` tabs and the private Drive folder for recent photos.
3. Deploy > New deployment > Web app > Execute as: Me, Access: Anyone. Copy the
   `/exec` URL.
4. Set `API_URL` to that URL in both `index.html` and `view.html`.
5. Commit and push; enable Pages (Settings > Pages > `main` branch).
6. Share the page link and the passphrase with the group.

After any later edit to `Code.gs`: Deploy > Manage deployments > edit > New
version, otherwise the live backend keeps running the old code.

## Data

- Names: the Sheet's `Log` tab. Every save is appended, nothing is
  overwritten; the latest row per number wins.
- Recent photos: private files in the Drive folder "Whos-who recent photos",
  logged on the `Photos` tab. The page downsizes them before upload.

## Options in `Code.gs`

- `COUNT` (40): number of people.
- `PUBLIC_VIEW`: `false` turns off `view.html`.
- `PUBLIC_PHOTOS`: `false` makes `view.html` show names only.

## Notes

The `/exec` URL is in the page source, so anyone with the link can call the
backend. The passphrase is the only protection for writing; keep it out of the
repo and rotate it by editing `Code.gs` and deploying a new version.

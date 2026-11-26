# Card Tracking demo

Open `index.html` in a web browser (double-click it), or upload this whole folder to any web host.

| File | What it does |
|---|---|
| `index.html` | The page |
| `style.css` | Colours, layout and fonts |
| `app.js` | Screens: dashboard, totals, movements, wards, users, audit trail, Excel import and export |
| `backend.js` | The rules (balances, approvals, roles, audit trail). In the demo they run inside the browser |
| `sample-data.js` | The location list (states, LGAs, wards, communities), loaded with the "Load location list" button |
| `xlsx.full.min.js` | SheetJS library for reading and writing Excel files |

Keep all the files together in the same folder.

This is a demo: each visitor's data is saved only in their own browser. For real shared use, set up the Google version (see SETUP_GUIDE.md in the repository).

Logins after loading the location list: `admin`, `officer`, `viewer`, password `password1`.

# Card Tracking

A free, simple web app for a card department to account for every card from production to the field across Nigeria: **State › LGA › Community › Ward**, with head count at ward level rolling up to national totals.

![Dashboard](docs/preview-dashboard.png)

## Features
- Dashboard with national totals, where the cards are now, and all 36 states + FCT (with capitals)
- Drill-down totals by State, LGA, Community and Ward: head count, ordered, received, distributed, damaged/lost, still at production, in store, coverage %
- Movements log: Sent to Production, Received from Production, Distributed to Field, Damaged / Lost, each with date, reference, ward, quantity, officer and approver
- Balance checks stop entries that don't add up (e.g. distributing more than is in store)
- Roles: **admin** (records & approves, manages wards/users), **officer** (records; needs approval), **viewer** (view & export)
- Nothing is deleted: wrong entries are voided with a reason; full audit trail of sign-ins and changes
- Export to Excel for reconciliation; import wards and past movements from Excel

## How it runs
Google Apps Script web app attached to a private Google Sheet (the database). No server or hosting costs. Staff sign in with app usernames and passwords; they don't need Google accounts.

| File | What it is |
|---|---|
| `Code.gs` | Server side: data, rules, logins, audit trail |
| `Index.html` | The web page the staff use |
| `Card_Tracking_Preview.html` | A preview copy that runs on your own computer: download it and double-click. Data stays in that browser. |
| `SETUP_GUIDE.md` | Step-by-step setup in plain language (about 15 minutes) |
| `docs/Card_Tracking_Sample.xlsx` | Sample data you can import to try the app |

See **[SETUP_GUIDE.md](SETUP_GUIDE.md)** to put it online.

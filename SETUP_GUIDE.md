# Card Tracking app: setup guide

This guide puts the card tracking app online for free, using a Google account. It takes about 15 minutes. You do not need to know any programming. You only copy and paste two files.

**What you need**
- A Google account (Gmail). It is best to use one that belongs to the department, not a personal one, because this account will own all the data.
- The two app files: `Code.gs` and `Index.html` (in the same folder as this guide).

**How it works**
- The data is stored in a Google Sheet that only you (the owner) can open.
- Your staff use the app through a web link with their own username and password. They never need a Google account and never touch the Sheet directly.
- It costs nothing. Google hosts it.

---

## Step 1. Create the Google Sheet

1. Sign in to the Google account and go to **https://sheets.new**. A blank spreadsheet opens.
2. Click "Untitled spreadsheet" at the top left and rename it **Card Tracking Data**.

## Step 2. Add the app code

1. In the spreadsheet menu, click **Extensions › Apps Script**. A new tab opens with a code editor.
2. At the top left, click "Untitled project" and rename it **Card Tracking**.
3. On the left you will see a file called **Code.gs**. Click it, select everything in the editor (Ctrl+A, or Cmd+A on a Mac) and delete it.
4. Open the `Code.gs` file from this folder, copy everything in it, and paste it into the editor.
5. Next to "Files" on the left, click the **+** button, choose **HTML**, and type the name **Index** (capital I, nothing after it). Press Enter.
6. Delete what is in the new Index file, then copy everything from `Index.html` and paste it in.
7. Click the **Save** icon (the floppy disk) at the top.

## Step 3. Give the app permission (one time)

1. At the top of the editor there is a drop-down that lists functions. Choose **setup**, then click **Run**.
2. Google asks you to review permissions. Click **Review permissions** and choose your account.
3. Google shows "Google hasn't verified this app". This is normal for your own private code. Click **Advanced**, then **Go to Card Tracking (unsafe)**, then **Allow**.
4. When it finishes, go back to the spreadsheet tab. You will see new tabs: Users, States, Ward Register, Movements Log and Audit Trail. The States tab already lists all 36 states and FCT with their capitals.

## Step 4. Put the app online

1. In the Apps Script tab, click the blue **Deploy** button (top right), then **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - Description: `Card Tracking`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, then copy the **Web app URL**. This is the link to your app. Save it somewhere safe and bookmark it.

"Anyone" only means anyone with the link can see the sign-in page. Nobody can see any figures without a username and password that you create.

## Step 5. First sign-in

1. Open the Web app URL. The first time, it asks you to **create the admin account**. Enter your name, a username and a password.
2. You are now signed in as the admin.
3. Go to **Users › Add user** and create an account for each staff member:
   - **Viewer**: can see everything and export to Excel, cannot change anything.
   - **Officer**: can record movements. Each one waits until an admin approves it.
   - **Admin**: records movements (approved straight away), approves or rejects officers' entries, manages wards and users.
4. Give each person their username and starting password privately. They can change their password with the **Password** button at the top.

## Step 6. Add your wards

Go to **Ward register**. You can either:
- click **Add ward** and fill in State, LGA, Community, Ward name and Head count, or
- click **Import wards from Excel** and choose a spreadsheet with the columns **State, LGA, Community, Ward, Head Count**. The app gives each ward an ID like `LAG-IKE-01-W1`.

Head count is entered per ward. The app adds it up for every community, LGA, state and the whole country.

**Want to try it first?** Import the `Ward Register` and `Movements Log` sheets from `Card_Tracking_Sample.xlsx` (Ward register › Import, then Movements › Import). The dashboard will match the sample workbook. When you are ready for real data, open the Google Sheet, and in the **Ward Register** and **Movements Log** tabs delete every row except the first (heading) row.

---

## Daily use

- **Record a movement**: Movements tab › choose the type, date, quantity, the ward (State › LGA › Community › Ward), the officer who handled it, a reference number (waybill, delivery note) and remarks. The app shows the ward's current balance and stops entries that do not add up, for example distributing more cards than are in store.
- **Approve**: officers' entries show as *Pending* with a count on the Movements tab. Admins click **Approve** or **Reject** (with a reason). Only approved entries count in the totals.
- **Mistakes**: an approved movement is never deleted. An admin clicks **Void** and gives a reason. It stays in the log, marked Voided, and stops counting.
- **Totals by area**: switch between State, LGA, Community and Ward, or click any row to go one level down.
- **Export to Excel**: the button at the top downloads a workbook with the dashboard, state, LGA, community and ward summaries and the full movements log, for reconciliation.
- **Audit trail** (admins): every sign-in and every change, with who did it and when.

## Good to know

- **Backups**: Google keeps the Sheet's history (File › Version history in the spreadsheet). Exporting to Excel once a week gives you an extra copy.
- **Do not edit the Google Sheet by hand** during normal use. Use the app, so that every change is checked and recorded in the audit trail.
- **Forgotten password**: an admin opens Users › Edit and types a new password. If the only admin forgets theirs, the owner opens **Extensions › Apps Script**, finds `ownerResetPassword` at the bottom of Code.gs, types the username and a new password into it, chooses that function in the drop-down and clicks **Run**.
- **Sign-in lasts 6 hours**, then the app asks for the password again. Five wrong passwords in a row lock that account for 15 minutes.
- **Updating the app later**: paste the new code into the same files, save, then click **Deploy › Manage deployments**, click the pencil icon, choose **Version: New version**, and click **Deploy**. The link stays the same.
- **Capacity**: this works comfortably for thousands of wards and tens of thousands of movements, with a handful of people using it at once.

/* Demo back end: the same rules as Code.gs, running inside the browser.
   Data is saved only in this browser (localStorage). */
var PREVIEW_KEY = 'card_tracking_preview_v2';
var GAS = (function () {
  var store = {};
  try { store = JSON.parse(localStorage.getItem(PREVIEW_KEY) || '{}'); } catch (e) { store = {}; }
  var sheetsData = store.sheets || {};
  var cacheData = {};
  try { cacheData = JSON.parse(sessionStorage.getItem(PREVIEW_KEY + '_cache') || '{}'); } catch (e) {}
  function saveCache() { try { sessionStorage.setItem(PREVIEW_KEY + '_cache', JSON.stringify(cacheData)); } catch (e) {} }
  function save() { try { localStorage.setItem(PREVIEW_KEY, JSON.stringify({ sheets: sheetsData })); } catch (e) {} }
  function makeSheet(name) {
    var data = sheetsData[name] = sheetsData[name] || [];
    return {
      getMaxRows: function () { return 1000; },
      setFrozenRows: function () {},
      getLastRow: function () { for (var i = data.length - 1; i >= 0; i--) if (data[i] && data[i].some(function (v) { return v !== '' && v != null; })) return i + 1; return 0; },
      getRange: function (r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        return {
          getValues: function () { var out = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) { var v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v == null ? '' : v); } out.push(row); } return out; },
          setValues: function (vals) { for (var i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (var j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = vals[i][j]; } save(); return this; },
          setNumberFormat: function () { return this; }, setFontWeight: function () { return this; }
        };
      }
    };
  }
  var sheetObjs = {};
  var ss = {
    getSheetByName: function (n) { return sheetsData[n] ? (sheetObjs[n] = sheetObjs[n] || makeSheet(n)) : null; },
    insertSheet: function (n) { sheetsData[n] = []; return (sheetObjs[n] = makeSheet(n)); },
    getSpreadsheetTimeZone: function () { return 'Africa/Lagos'; }
  };
  // small synchronous SHA-256
  function sha256(str) {
    var bytes = Array.from(new TextEncoder().encode(str));
    var K = [], H = [], p = 0, isP = function (n) { for (var f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
    for (var n = 2; p < 64; n++) if (isP(n)) { if (p < 8) H[p] = (Math.pow(n, 1 / 2) * 4294967296) | 0; K[p++] = (Math.pow(n, 1 / 3) * 4294967296) | 0; }
    var l = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (var i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    var rot = function (x, n) { return (x >>> n) | (x << (32 - n)); };
    for (var o = 0; o < bytes.length; o += 64) {
      var w = [];
      for (i = 0; i < 64; i++) {
        if (i < 16) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
        else { var a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + w[i - 7] + (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10))) | 0; }
      }
      var h = H.slice();
      for (i = 0; i < 64; i++) {
        var t1 = (h[7] + (rot(h[4], 6) ^ rot(h[4], 11) ^ rot(h[4], 25)) + ((h[4] & h[5]) ^ (~h[4] & h[6])) + K[i] + w[i]) | 0;
        var t2 = ((rot(h[0], 2) ^ rot(h[0], 13) ^ rot(h[0], 22)) + ((h[0] & h[1]) ^ (h[0] & h[2]) ^ (h[1] & h[2]))) | 0;
        h = [(t1 + t2) | 0].concat(h.slice(0, 3), [(h[3] + t1) | 0], h.slice(4, 7));
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + h[i]) | 0;
    }
    var out = []; H.forEach(function (x) { for (var s = 24; s >= 0; s -= 8) out.push((x >>> s) & 255); });
    return out;
  }
  var SpreadsheetApp = { getActiveSpreadsheet: function () { return ss; } };
  var CacheService = { getScriptCache: function () { return { get: function (k) { return k in cacheData ? cacheData[k] : null; }, put: function (k, v) { cacheData[k] = String(v); saveCache(); }, remove: function (k) { delete cacheData[k]; saveCache(); } }; } };
  var LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  var Utilities = {
    getUuid: function () { return (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); },
    DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
    computeDigest: function (a, s) { return sha256(s); },
    base64Encode: function (b) { return btoa(String.fromCharCode.apply(null, b)); },
    formatDate: function (d, tz, f) {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d);
      var g = function (t) { return p.filter(function (x) { return x.type === t; })[0].value; };
      return f.replace('yyyy', g('year')).replace('MM', g('month')).replace('dd', g('day')).replace('HH', g('hour')).replace('mm', g('minute')).replace('ss', g('second'));
    }
  };
  var HtmlService = {}, Logger = { log: function () {} };
/**
 * Card Tracking: Card Department web app
 * ---------------------------------------------------------------
 * Runs on Google Apps Script, attached to a Google Sheet.
 * The Google Sheet is the database. Each tab is one table:
 *   Users, States, Ward Register, Movements Log, Audit Trail
 *
 * Roles
 *   admin:   records movements (approved at once), approves or rejects
 *             movements recorded by officers, manages wards and users.
 *   officer: records movements (they wait for an admin's approval).
 *   viewer:  can see everything and export to Excel, cannot change data.
 *
 * Only APPROVED movements count in totals. Nothing is ever deleted:
 * a wrong approved movement is "voided" with a reason, and every
 * change is written to the Audit Trail tab.
 */

var APP_NAME = 'Card Tracking';
var SESSION_SECONDS = 6 * 60 * 60; // 6 hours (the longest Google allows)
var MAX_FAILED_LOGINS = 5;

var TABLES = {
  users: {
    name: 'Users',
    headers: ['Username', 'Full Name', 'Role', 'Password Hash', 'Salt', 'Active', 'Created At']
  },
  states: { name: 'States', headers: ['State', 'Capital'] },
  wards: {
    name: 'Ward Register',
    headers: ['Ward ID', 'State', 'LGA', 'Ward', 'Communities', 'Head Count', 'Updated By', 'Updated At']
  },
  movements: {
    name: 'Movements Log',
    headers: ['Movement ID', 'Date', 'Reference No.', 'Ward ID', 'Community', 'Movement Type', 'Quantity',
      'Officer (handled by)', 'Recorded By', 'Recorded At', 'Status', 'Approved By',
      'Approved At', 'Remarks', 'Status Note']
  },
  audit: { name: 'Audit Trail', headers: ['Timestamp', 'User', 'Action', 'Details'] }
};

var TYPES = ['Sent to Production', 'Received from Production', 'Distributed to Field', 'Damaged / Lost'];
var ROLES = ['admin', 'officer', 'viewer'];

var STATES = [
  ['Abia', 'Umuahia'], ['Adamawa', 'Yola'], ['Akwa Ibom', 'Uyo'], ['Anambra', 'Awka'],
  ['Bauchi', 'Bauchi'], ['Bayelsa', 'Yenagoa'], ['Benue', 'Makurdi'], ['Borno', 'Maiduguri'],
  ['Cross River', 'Calabar'], ['Delta', 'Asaba'], ['Ebonyi', 'Abakaliki'], ['Edo', 'Benin City'],
  ['Ekiti', 'Ado-Ekiti'], ['Enugu', 'Enugu'], ['FCT', 'Abuja'], ['Gombe', 'Gombe'],
  ['Imo', 'Owerri'], ['Jigawa', 'Dutse'], ['Kaduna', 'Kaduna'], ['Kano', 'Kano'],
  ['Katsina', 'Katsina'], ['Kebbi', 'Birnin Kebbi'], ['Kogi', 'Lokoja'], ['Kwara', 'Ilorin'],
  ['Lagos', 'Ikeja'], ['Nasarawa', 'Lafia'], ['Niger', 'Minna'], ['Ogun', 'Abeokuta'],
  ['Ondo', 'Akure'], ['Osun', 'Osogbo'], ['Oyo', 'Ibadan'], ['Plateau', 'Jos'],
  ['Rivers', 'Port Harcourt'], ['Sokoto', 'Sokoto'], ['Taraba', 'Jalingo'], ['Yobe', 'Damaturu'],
  ['Zamfara', 'Gusau']
];

/* ================================================================
 * Web app entry points
 * ================================================================ */

function doGet() {
  ensureSheets_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Run this once from the editor (optional): creates the tabs. */
function setup() {
  ensureSheets_();
}

/**
 * The single function the web page calls.
 * Always returns { ok: true, data } or { ok: false, error }.
 */
function api(action, token, payload) {
  try {
    tableCache_ = {};
    ensureSheets_();
    payload = payload || {};
    var publicActions = { status: 1, setupAdmin: 1, login: 1 };
    var user = null;
    if (!publicActions[action]) {
      user = userFromToken_(token);
      if (!user) return { ok: false, error: 'Your session has ended. Please sign in again.', signedOut: true };
    }
    var fn = ACTIONS[action];
    if (!fn) throw new Error('Unknown action: ' + action);
    return { ok: true, data: fn(payload, user, token) };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

var ACTIONS = {
  status: function () {
    return { needsSetup: readTable_('users').length === 0, appName: APP_NAME };
  },

  setupAdmin: function (p) {
    return withLock_(function () {
      if (readTable_('users').length > 0) throw new Error('The first admin has already been created. Please sign in.');
      var username = cleanUsername_(p.username);
      var fullName = requireText_(p.fullName, 'Full name');
      checkPassword_(p.password);
      var salt = Utilities.getUuid();
      appendRows_('users', [[username, fullName, 'admin', hash_(p.password, salt), salt, 'Yes', now_()]]);
      audit_(username, 'Created first admin', fullName);
      return ACTIONS.login({ username: username, password: p.password });
    });
  },

  login: function (p) {
    var username = String(p.username || '').trim().toLowerCase();
    var cache = CacheService.getScriptCache();
    var failKey = 'fail_' + username;
    var fails = Number(cache.get(failKey) || 0);
    if (fails >= MAX_FAILED_LOGINS) {
      throw new Error('Too many wrong passwords. This account is locked for 15 minutes.');
    }
    var row = findUser_(username);
    if (!row || row.Active !== 'Yes' || hash_(String(p.password || ''), row.Salt) !== row['Password Hash']) {
      cache.put(failKey, String(fails + 1), 15 * 60);
      throw new Error('Wrong username or password.');
    }
    cache.remove(failKey);
    var token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('sess_' + token, username, SESSION_SECONDS);
    audit_(username, 'Signed in', '');
    return { token: token, user: publicUser_(row) };
  },

  logout: function (p, user, token) {
    CacheService.getScriptCache().remove('sess_' + token);
    return true;
  },

  getData: function (p, user) {
    var wards = readTable_('wards').map(function (w) {
      return {
        id: String(w['Ward ID']), state: w.State, lga: w.LGA, ward: String(w.Ward),
        communities: String(w.Communities || ''), head: num_(w['Head Count'])
      };
    });
    var movements = readTable_('movements').map(movementOut_);
    return {
      user: user,
      types: TYPES,
      states: readTable_('states').map(function (s) { return { state: s.State, capital: s.Capital }; }),
      wards: wards,
      movements: movements,
      serverTime: now_()
    };
  },

  /* ---------------- movements ---------------- */

  recordMovement: function (p, user) {
    requireRole_(user, ['admin', 'officer']);
    return withLock_(function () {
      var m = validateMovement_(p);
      var isAdmin = user.role === 'admin';
      // Checked now for everyone, and checked again when an admin approves.
      checkBalance_(m.wardId, m.type, m.quantity);
      var id = nextMovementId_();
      var status = isAdmin ? 'Approved' : 'Pending';
      appendRows_('movements', [[
        id, m.date, m.reference, m.wardId, m.community, m.type, m.quantity, m.officer || user.fullName,
        user.username, now_(), status, isAdmin ? user.fullName : '', isAdmin ? now_() : '',
        m.remarks, ''
      ]]);
      audit_(user.username, 'Recorded movement ' + id + ' (' + status + ')',
        m.type + ', ' + m.quantity + ' cards, ward ' + m.wardId + (m.community ? ' (' + m.community + ')' : ''));
      return { id: id, status: status };
    });
  },

  approveMovement: function (p, user) {
    requireRole_(user, ['admin']);
    return withLock_(function () {
      var hit = findRow_('movements', 'Movement ID', p.id);
      if (!hit) throw new Error('Movement not found.');
      if (hit.row.Status !== 'Pending') throw new Error('Only pending movements can be approved.');
      checkBalance_(hit.row['Ward ID'], hit.row['Movement Type'], num_(hit.row.Quantity));
      updateRow_('movements', hit.row, { 'Status': 'Approved', 'Approved By': user.fullName, 'Approved At': now_() });
      audit_(user.username, 'Approved movement ' + p.id, '');
      return true;
    });
  },

  rejectMovement: function (p, user) {
    requireRole_(user, ['admin']);
    return withLock_(function () {
      var note = requireText_(p.note, 'A reason');
      var hit = findRow_('movements', 'Movement ID', p.id);
      if (!hit) throw new Error('Movement not found.');
      if (hit.row.Status !== 'Pending') throw new Error('Only pending movements can be rejected.');
      updateRow_('movements', hit.row, {
        'Status': 'Rejected', 'Approved By': user.fullName, 'Approved At': now_(), 'Status Note': note
      });
      audit_(user.username, 'Rejected movement ' + p.id, note);
      return true;
    });
  },

  voidMovement: function (p, user) {
    requireRole_(user, ['admin']);
    return withLock_(function () {
      var note = requireText_(p.note, 'A reason');
      var hit = findRow_('movements', 'Movement ID', p.id);
      if (!hit) throw new Error('Movement not found.');
      if (hit.row.Status !== 'Approved') throw new Error('Only approved movements can be voided.');
      // Voiding an incoming movement must not leave the ward with a negative balance.
      checkVoid_(hit.row);
      updateRow_('movements', hit.row, {
        'Status': 'Voided', 'Status Note': note + ' (voided by ' + user.fullName + ' on ' + now_() + ')'
      });
      audit_(user.username, 'Voided movement ' + p.id, note);
      return true;
    });
  },

  importMovements: function (p, user) {
    requireRole_(user, ['admin']);
    return withLock_(function () {
      var rows = p.rows || [];
      var errors = [];
      var out = [];
      var wardIds = {};
      readTable_('wards').forEach(function (w) { wardIds[String(w['Ward ID'])] = true; });
      var startNum = movementCount_();
      rows.forEach(function (r, i) {
        try {
          var m = validateMovement_(r, wardIds);
          var id = 'MV-' + pad_(startNum + out.length + 1, 5);
          out.push([id, m.date, m.reference, m.wardId, m.community, m.type, m.quantity, m.officer || '',
            user.username, now_(), 'Approved', r.approvedBy ? String(r.approvedBy) : user.fullName, now_(),
            m.remarks, 'Imported from Excel']);
        } catch (e) {
          errors.push('Row ' + (r._row || i + 2) + ': ' + e.message);
        }
      });
      if (out.length) appendRows_('movements', out);
      audit_(user.username, 'Imported movements', out.length + ' added, ' + errors.length + ' skipped');
      return { added: out.length, errors: errors };
    });
  },

  /* ---------------- wards ---------------- */

  saveWard: function (p, user) {
    requireRole_(user, ['admin']);
    return withLock_(function () {
      var w = validateWard_(p);
      var idx = wardIndex_();
      var clash = idx.byKey[wardKey_(w.state, w.lga, w.ward)];
      var head = w.head === null ? 0 : w.head;
      if (p.id) {
        var row = idx.byId[String(p.id)];
        if (!row) throw new Error('Ward not found.');
        if (clash && clash !== row) throw new Error('Another ward in this LGA already has this name.');
        var oldHead = row['Head Count'];
        updateRow_('wards', row, {
          'State': w.state, 'LGA': w.lga, 'Ward': w.ward, 'Communities': w.communities.join('; '),
          'Head Count': head, 'Updated By': user.username, 'Updated At': now_()
        });
        audit_(user.username, 'Updated ward ' + p.id, 'Head count ' + oldHead + ' -> ' + head + '; ' +
          [w.state, w.lga, w.ward].join(' / ') + '; ' + w.communities.length + ' communities');
        return { id: p.id };
      }
      if (clash) throw new Error('This ward is already in the register (' + clash['Ward ID'] + ').');
      var id = newWardId_(idx, w);
      appendRows_('wards', [[id, w.state, w.lga, w.ward, w.communities.join('; '), head, user.username, now_()]]);
      audit_(user.username, 'Added ward ' + id, [w.state, w.lga, w.ward, 'head count ' + head, w.communities.length + ' communities'].join(' / '));
      return { id: id };
    });
  },

  /**
   * rows: [{ id?, state, lga, ward, communities: [..], head? }]
   * A ward that already exists (same ID, or same state + LGA + ward name) is updated:
   * new communities are added to its list, and its head count is replaced only when one is given.
   */
  importWards: function (p, user) {
    requireRole_(user, ['admin']);
    return withLock_(function () {
      var rows = p.rows || [];
      var idx = wardIndex_();
      var errors = [], added = [], changed = [], seen = {};
      rows.forEach(function (r, i) {
        try {
          var w = validateWard_(r);
          var key = wardKey_(w.state, w.lga, w.ward);
          var givenId = String(r.id || '').trim();
          var row = (givenId && idx.byId[givenId]) || idx.byKey[key];
          if (row && row._new) {
            // Same ward twice in one batch: just merge into the new row.
            row.Communities = mergeComms_(splitComms_(row.Communities), w.communities).join('; ');
            if (w.head !== null) row['Head Count'] = w.head;
            return;
          }
          if (row) {
            var merged = mergeComms_(splitComms_(row.Communities), w.communities).join('; ');
            var newHead = w.head === null ? row['Head Count'] : w.head;
            if (merged !== String(row.Communities || '') || String(newHead) !== String(row['Head Count'])) {
              row.Communities = merged; row['Head Count'] = newHead;
              row['Updated By'] = user.username; row['Updated At'] = now_();
              if (!seen[row._row]) { seen[row._row] = 1; changed.push(row); }
            }
            return;
          }
          var id = givenId && !idx.ids[givenId] ? givenId : newWardId_(idx, w);
          var nr = { 'Ward ID': id, State: w.state, LGA: w.lga, Ward: w.ward, Communities: w.communities.join('; '),
            'Head Count': w.head === null ? 0 : w.head, 'Updated By': user.username, 'Updated At': now_(), _new: true };
          idxAdd_(idx, nr);
          added.push(nr);
        } catch (e) {
          errors.push('Row ' + (r._row || i + 2) + ': ' + e.message);
        }
      });
      if (changed.length) writeRows_('wards', changed);
      if (added.length) {
        var headers = TABLES.wards.headers;
        appendRows_('wards', added.map(function (o) { return headers.map(function (h) { return o[h]; }); }));
      }
      audit_(user.username, 'Imported wards', added.length + ' added, ' + changed.length + ' updated, ' + errors.length + ' skipped');
      return { added: added.length, updated: changed.length, errors: errors };
    });
  },

  /* ---------------- users ---------------- */

  listUsers: function (p, user) {
    requireRole_(user, ['admin']);
    return readTable_('users').map(publicUser_);
  },

  saveUser: function (p, user) {
    requireRole_(user, ['admin']);
    return withLock_(function () {
      var username = cleanUsername_(p.username);
      var fullName = requireText_(p.fullName, 'Full name');
      var role = String(p.role || '').toLowerCase();
      if (ROLES.indexOf(role) < 0) throw new Error('Choose a role: admin, officer or viewer.');
      var active = p.active === false ? 'No' : 'Yes';
      var hit = findRow_('users', 'Username', username);
      if (p.isNew) {
        if (hit) throw new Error('That username is already taken.');
        checkPassword_(p.password);
        var salt = Utilities.getUuid();
        appendRows_('users', [[username, fullName, role, hash_(p.password, salt), salt, active, now_()]]);
        audit_(user.username, 'Added user ' + username, role);
        return true;
      }
      if (!hit) throw new Error('User not found.');
      if (username === user.username && (role !== 'admin' || active !== 'Yes')) {
        throw new Error('You cannot remove your own admin access.');
      }
      var changes = { 'Full Name': fullName, 'Role': role, 'Active': active };
      if (p.password) {
        checkPassword_(p.password);
        var s = Utilities.getUuid();
        changes['Salt'] = s;
        changes['Password Hash'] = hash_(p.password, s);
      }
      updateRow_('users', hit.row, changes);
      audit_(user.username, 'Updated user ' + username,
        'role ' + role + ', active ' + active + (p.password ? ', password reset' : ''));
      return true;
    });
  },

  changePassword: function (p, user) {
    return withLock_(function () {
      var hit = findRow_('users', 'Username', user.username);
      if (hash_(String(p.oldPassword || ''), hit.row.Salt) !== hit.row['Password Hash']) {
        throw new Error('Your current password is not correct.');
      }
      checkPassword_(p.newPassword);
      var s = Utilities.getUuid();
      updateRow_('users', hit.row, { 'Salt': s, 'Password Hash': hash_(p.newPassword, s) });
      audit_(user.username, 'Changed own password', '');
      return true;
    });
  },

  getAudit: function (p, user) {
    requireRole_(user, ['admin']);
    var rows = readTable_('audit');
    return rows.slice(-1000).reverse().map(function (r) {
      return { time: fmtCell_(r.Timestamp), user: r.User, action: r.Action, details: r.Details };
    });
  }
};

/* ================================================================
 * Rules
 * ================================================================ */

function validateMovement_(p, wardIdSet) {
  var date = normDate_(p.date);
  if (!date) throw new Error('Enter a valid date.');
  var type = matchType_(p.type);
  if (!type) throw new Error('Choose a movement type.');
  var quantity = Number(p.quantity);
  if (!(quantity > 0) || Math.floor(quantity) !== quantity) throw new Error('Quantity must be a whole number above 0.');
  var wardId = String(p.wardId || '').trim();
  if (!wardId) throw new Error('Choose a ward.');
  if (wardIdSet) {
    if (!wardIdSet[wardId]) throw new Error('ward ID ' + wardId + ' is not in the Ward Register');
  } else if (!findRow_('wards', 'Ward ID', wardId)) {
    throw new Error('That ward is not in the Ward Register.');
  }
  var community = titleTrim_(String(p.community || ''));
  if (community && !wardIdSet) {
    var w = findRow_('wards', 'Ward ID', wardId).row;
    var known = splitComms_(w.Communities).map(function (c) { return c.toLowerCase(); });
    if (known.indexOf(community.toLowerCase()) < 0) throw new Error('That community is not listed under this ward.');
  }
  return {
    date: date, type: type, quantity: quantity, wardId: wardId, community: community,
    reference: String(p.reference || '').trim(),
    officer: String(p.officer || '').trim(),
    remarks: String(p.remarks || '').trim()
  };
}

function matchType_(t) {
  var k = String(t || '').toLowerCase().replace(/[^a-z]/g, '');
  for (var i = 0; i < TYPES.length; i++) {
    if (TYPES[i].toLowerCase().replace(/[^a-z]/g, '') === k) return TYPES[i];
  }
  return null;
}

/** Totals for one ward from APPROVED movements. */
function wardTotals_(wardId, skipId) {
  var t = { ordered: 0, received: 0, distributed: 0, damaged: 0 };
  readTable_('movements').forEach(function (m) {
    if (String(m['Ward ID']) !== String(wardId) || m.Status !== 'Approved') return;
    if (skipId && m['Movement ID'] === skipId) return;
    var q = num_(m.Quantity);
    switch (m['Movement Type']) {
      case TYPES[0]: t.ordered += q; break;
      case TYPES[1]: t.received += q; break;
      case TYPES[2]: t.distributed += q; break;
      case TYPES[3]: t.damaged += q; break;
    }
  });
  t.atProduction = t.ordered - t.received;
  t.inStore = t.received - t.distributed - t.damaged;
  return t;
}

/** Stops a movement that would make the ward's counts go below zero. */
function checkBalance_(wardId, type, quantity) {
  var t = wardTotals_(wardId);
  if (type === TYPES[1] && quantity > t.atProduction) {
    throw new Error('Only ' + fmtN_(t.atProduction) + ' cards for this ward are still at production (ordered ' +
      fmtN_(t.ordered) + ', received ' + fmtN_(t.received) + '). Record the order first, or check the quantity.');
  }
  if ((type === TYPES[2] || type === TYPES[3]) && quantity > t.inStore) {
    throw new Error('Only ' + fmtN_(t.inStore) + ' cards for this ward are in store. You cannot ' +
      (type === TYPES[2] ? 'distribute' : 'write off') + ' ' + fmtN_(quantity) + '.');
  }
}

function checkVoid_(row) {
  var t = wardTotals_(row['Ward ID'], row['Movement ID']);
  if (t.atProduction < 0 || t.inStore < 0) {
    throw new Error('Voiding this would make the ward\'s balance negative. Void the later movements that depend on it first.');
  }
}

function validateWard_(p) {
  var state = matchState_(p.state);
  if (!state) throw new Error('Unknown state "' + (p.state || '') + '"');
  var lga = titleTrim_(requireText_(p.lga, 'LGA'));
  var ward = titleTrim_(requireText_(p.ward, 'Ward name'));
  if (lga === '0' || ward === '0') throw new Error('LGA or ward is missing ("0")');
  var comms = Array.isArray(p.communities) ? p.communities : splitComms_(p.communities);
  comms = mergeComms_([], comms.map(function (c) { return titleTrim_(String(c)).replace(/;/g, ','); }).filter(Boolean));
  var raw = String(p.head === undefined || p.head === null ? '' : p.head).replace(/,/g, '').trim();
  var head = null;
  if (raw !== '') {
    head = Number(raw);
    if (!(head >= 0) || Math.floor(head) !== head) throw new Error('Head count must be a whole number (0 or more).');
  }
  return { state: state, lga: lga, ward: ward, communities: comms, head: head };
}

function matchState_(s) {
  var k = String(s || '').toLowerCase().replace(/[^a-z]/g, '').replace(/state$/, '');
  if (k === 'abuja' || k === 'federalcapitalterritory' || k === 'fctabuja') k = 'fct';
  if (k === 'nassarawa') k = 'nasarawa';
  if (k === 'akwaibom') k = 'akwaibom';
  for (var i = 0; i < STATES.length; i++) {
    if (STATES[i][0].toLowerCase().replace(/[^a-z]/g, '') === k) return STATES[i][0];
  }
  return null;
}

function splitComms_(v) {
  return String(v || '').split(/\s*[;\n]\s*/).map(titleTrim_).filter(Boolean);
}

function mergeComms_(a, b) {
  var seen = {}, out = [];
  a.concat(b).forEach(function (c) {
    var k = c.toLowerCase();
    if (!seen[k]) { seen[k] = 1; out.push(c); }
  });
  return out;
}

function wardKey_(state, lga, ward) { return [state, lga, ward].join('|').toLowerCase(); }

/** Lookup tables for the Ward Register, built once per request. */
function wardIndex_() {
  var idx = { byId: {}, byKey: {}, ids: {}, lgaCode: {}, codeOwner: {}, lgaCount: {} };
  readTable_('wards').forEach(function (w) { idxAdd_(idx, w); });
  return idx;
}

function idxAdd_(idx, w) {
  var id = String(w['Ward ID']);
  idx.byId[id] = w; idx.ids[id] = true;
  idx.byKey[wardKey_(w.State, w.LGA, w.Ward)] = w;
  var lk = (w.State + '|' + w.LGA).toLowerCase();
  var parts = id.split('-');
  if (parts.length === 3 && !idx.lgaCode[lk]) {
    idx.lgaCode[lk] = parts[1];
    idx.codeOwner[w.State + '|' + parts[1]] = lk;
  }
  idx.lgaCount[lk] = (idx.lgaCount[lk] || 0) + 1;
}

/**
 * Builds an ID like KAT-FUN-03: state code, LGA code, ward number in that LGA.
 * If two LGAs in a state start with the same letters, the second gets a number (KAN, KAN2).
 */
function newWardId_(idx, w) {
  var letters = function (s) { return String(s).toUpperCase().replace(/[^A-Z]/g, ''); };
  var lk = (w.state + '|' + w.lga).toLowerCase();
  var code = idx.lgaCode[lk];
  if (!code) {
    var base = letters(w.lga).slice(0, 3) || 'LGA', c = base, n = 2;
    while (idx.codeOwner[w.state + '|' + c] && idx.codeOwner[w.state + '|' + c] !== lk) c = base + (n++);
    code = c;
    idx.lgaCode[lk] = code;
    idx.codeOwner[w.state + '|' + code] = lk;
  }
  var sc = w.state === 'FCT' ? 'FCT' : letters(w.state).slice(0, 3);
  var k = (idx.lgaCount[lk] || 0) + 1, id;
  do { id = sc + '-' + code + '-' + pad_(k, 2); k++; } while (idx.ids[id]);
  return id;
}

/* ================================================================
 * Users & sessions
 * ================================================================ */

function userFromToken_(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var username = cache.get('sess_' + token);
  if (!username) return null;
  var row = findUser_(username);
  if (!row || row.Active !== 'Yes') return null;
  cache.put('sess_' + token, username, SESSION_SECONDS); // keep alive while in use
  return publicUser_(row);
}

function findUser_(username) {
  var hit = findRow_('users', 'Username', String(username || '').toLowerCase());
  return hit ? hit.row : null;
}

function publicUser_(r) {
  return { username: String(r.Username), fullName: String(r['Full Name']), role: String(r.Role), active: r.Active === 'Yes' };
}

function requireRole_(user, roles) {
  if (roles.indexOf(user.role) < 0) throw new Error('Your account (' + user.role + ') is not allowed to do this.');
}

function cleanUsername_(u) {
  var s = String(u || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(s)) throw new Error('Username must be 3 to 30 letters or numbers (no spaces).');
  return s;
}

function checkPassword_(p) {
  if (String(p || '').length < 8) throw new Error('Password must be at least 8 characters.');
}

function hash_(password, salt) {
  var h = String(salt) + ':' + String(password);
  for (var i = 0; i < 50; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + String(salt), Utilities.Charset.UTF_8));
  }
  return h;
}

/* ================================================================
 * Sheet helpers
 * ================================================================ */

var tableCache_ = {};

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheets_() {
  var ss = ss_();
  Object.keys(TABLES).forEach(function (key) {
    var t = TABLES[key];
    var sh = ss.getSheetByName(t.name);
    if (!sh) {
      sh = ss.insertSheet(t.name);
      sh.getRange(1, 1, 1, t.headers.length).setValues([t.headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
      // Keep IDs, dates and names as plain text so Sheets does not reformat them.
      sh.getRange(1, 1, sh.getMaxRows(), t.headers.length).setNumberFormat('@');
      if (key === 'states') sh.getRange(2, 1, STATES.length, 2).setValues(STATES);
    }
  });
}

function sheet_(key) { return ss_().getSheetByName(TABLES[key].name); }

function readTable_(key) {
  if (tableCache_[key]) return tableCache_[key];
  var sh = sheet_(key);
  var headers = TABLES[key].headers;
  var last = sh.getLastRow();
  var rows = [];
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
    values.forEach(function (v, i) {
      if (v.join('') === '') return;
      var o = { _row: i + 2 };
      headers.forEach(function (h, i) { o[h] = v[i]; });
      rows.push(o);
    });
  }
  tableCache_[key] = rows;
  return rows;
}

function findRow_(key, column, value) {
  var rows = readTable_(key);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][column]).toLowerCase() === String(value).toLowerCase()) return { row: rows[i], index: i };
  }
  return null;
}

function appendRows_(key, rows) {
  var sh = sheet_(key);
  var start = sh.getLastRow() + 1;
  var width = TABLES[key].headers.length;
  var text = rows.map(function (r) { return r.map(function (c) { return c === null || c === undefined ? '' : c; }); });
  var range = sh.getRange(start, 1, text.length, width);
  range.setNumberFormat('@');
  range.setValues(text);
  delete tableCache_[key];
}

/** row is an object from readTable_ (it carries its sheet row number). */
function updateRow_(key, row, changes) {
  var sh = sheet_(key);
  var headers = TABLES[key].headers;
  var rowNum = row._row;
  if (!(rowNum >= 2)) throw new Error('Internal error: row number missing.');
  var range = sh.getRange(rowNum, 1, 1, headers.length);
  var current = range.getValues()[0];
  headers.forEach(function (h, i) { if (changes.hasOwnProperty(h)) current[i] = changes[h]; });
  range.setValues([current]);
  delete tableCache_[key];
}

/** Writes back several changed row objects from readTable_ in one go. */
function writeRows_(key, rows) {
  var sh = sheet_(key);
  var headers = TABLES[key].headers;
  var min = Infinity, max = 0;
  rows.forEach(function (r) { min = Math.min(min, r._row); max = Math.max(max, r._row); });
  var range = sh.getRange(min, 1, max - min + 1, headers.length);
  var values = range.getValues();
  rows.forEach(function (r) { values[r._row - min] = headers.map(function (h) { return r[h] === undefined ? '' : r[h]; }); });
  range.setValues(values);
  delete tableCache_[key];
}

function audit_(username, action, details) {
  appendRows_('audit', [[now_(), username, action, details]]);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    tableCache_ = {};
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function movementCount_() { return readTable_('movements').length; }
function nextMovementId_() { return 'MV-' + pad_(movementCount_() + 1, 5); }

function movementOut_(m) {
  return {
    id: m['Movement ID'], date: normDate_(m.Date) || fmtCell_(m.Date), reference: m['Reference No.'],
    wardId: String(m['Ward ID']), community: m.Community, type: m['Movement Type'], quantity: num_(m.Quantity),
    officer: m['Officer (handled by)'], recordedBy: m['Recorded By'], recordedAt: fmtCell_(m['Recorded At']),
    status: m.Status, approvedBy: m['Approved By'], approvedAt: fmtCell_(m['Approved At']),
    remarks: m.Remarks, note: m['Status Note']
  };
}

/* ================================================================
 * Small utilities
 * ================================================================ */

function num_(v) { var n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
function pad_(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
function fmtN_(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function titleTrim_(s) { return String(s).replace(/\s+/g, ' ').trim(); }

function requireText_(v, label) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) throw new Error(label + ' is required.');
  return s;
}

function tz_() {
  try { return ss_().getSpreadsheetTimeZone() || 'Africa/Lagos'; } catch (e) { return 'Africa/Lagos'; }
}

function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }

function fmtCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm:ss');
  return v === null || v === undefined ? '' : String(v);
}

/** Accepts 2026-09-01, 01/09/2026 (day first), a Date, or an Excel serial number. Returns yyyy-MM-dd. */
function normDate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = String(v === undefined || v === null ? '' : v).trim();
  var m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return okDate_(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) return okDate_(+m[3], +m[2], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return okDate_(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

function okDate_(y, mo, d) {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return y + '-' + pad_(mo, 2) + '-' + pad_(d, 2);
}

/**
 * OWNER ONLY. If an admin forgets their password and no other admin can reset it:
 * type the username and a new password below, choose "ownerResetPassword" in the
 * function list at the top of the editor, click Run, then put the placeholders back.
 */
function ownerResetPassword() {
  var USERNAME = 'type-username-here';
  var NEW_PASSWORD = 'type-new-password-here';
  ensureSheets_();
  var hit = findRow_('users', 'Username', USERNAME.toLowerCase());
  if (!hit) throw new Error('No user called ' + USERNAME);
  checkPassword_(NEW_PASSWORD);
  var s = Utilities.getUuid();
  updateRow_('users', hit.row, { 'Salt': s, 'Password Hash': hash_(NEW_PASSWORD, s), 'Active': 'Yes' });
  CacheService.getScriptCache().remove('fail_' + USERNAME.toLowerCase());
  audit_('owner', 'Reset password from the editor', USERNAME);
  Logger.log('Password reset for ' + USERNAME);
}

  return { api: api, ACTIONS: ACTIONS };
})();

window.google = { script: { run: (function mk(s, f) {
  return {
    withSuccessHandler: function (h) { return mk(h, f); },
    withFailureHandler: function (h) { return mk(s, h); },
    api: function (a, t, p) { setTimeout(function () { try { s(GAS.api(a, t, JSON.parse(JSON.stringify(p || {})))); } catch (e) { f(e); } }, 30); }
  };
})(function () {}, function () {}) } };

function previewLoadSample() {
  var st = GAS.api('status');
  if (!st.data.needsSetup) { alert('The location list can only be loaded into an empty demo. Click "Start over" first.'); return; }
  var res = GAS.api('setupAdmin', null, { username: 'admin', fullName: 'Head of Card Dept', password: 'password1' });
  var tok = res.data.token;
  GAS.api('importWards', tok, { rows: PREVIEW_SAMPLE.wards });
  if (PREVIEW_SAMPLE.movements.length) GAS.api('importMovements', tok, { rows: PREVIEW_SAMPLE.movements });
  GAS.api('saveUser', tok, { isNew: true, username: 'officer', fullName: 'Records Officer', role: 'officer', password: 'password1' });
  GAS.api('saveUser', tok, { isNew: true, username: 'viewer', fullName: 'Department Viewer', role: 'viewer', password: 'password1' });
  try { sessionStorage.removeItem('ct_token'); } catch (e) {}
  location.reload();
}
function previewReset() {
  if (!confirm('Delete everything in this preview and start again?')) return;
  try { localStorage.removeItem(PREVIEW_KEY); sessionStorage.removeItem('ct_token'); } catch (e) {}
  location.reload();
}
document.addEventListener('DOMContentLoaded', function () {
  var bar = document.createElement('div');
  bar.id = 'preview-bar';
  bar.innerHTML = '<b>Preview copy.</b> Data is saved only in this browser. After loading the location list, sign in as <code>admin</code>, <code>officer</code> or <code>viewer</code> (password <code>password1</code>). ' +
    '<button onclick="previewLoadSample()">Load location list</button> <button onclick="previewReset()">Start over</button>';
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:80;background:#fff3dc;color:#5a3a00;border-top:1px solid #e8c98a;padding:6px 12px;font:13px system-ui,sans-serif;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  document.body.appendChild(bar);
  document.body.style.paddingBottom = '64px';
  var t = document.getElementById('toast'); if (t) t.style.bottom = '60px';
});

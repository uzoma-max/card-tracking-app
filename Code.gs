/**
 * Card Tracking — Card Department web app
 * ---------------------------------------------------------------
 * Runs on Google Apps Script, attached to a Google Sheet.
 * The Google Sheet is the database. Each tab is one table:
 *   Users, States, Ward Register, Movements Log, Audit Trail
 *
 * Roles
 *   admin   – records movements (approved at once), approves or rejects
 *             movements recorded by officers, manages wards and users.
 *   officer – records movements (they wait for an admin's approval).
 *   viewer  – can see everything and export to Excel, cannot change data.
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
    headers: ['Ward ID', 'State', 'LGA', 'Community', 'Ward', 'Head Count', 'Updated By', 'Updated At']
  },
  movements: {
    name: 'Movements Log',
    headers: ['Movement ID', 'Date', 'Reference No.', 'Ward ID', 'Movement Type', 'Quantity',
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
        id: w['Ward ID'], state: w.State, lga: w.LGA, community: w.Community,
        ward: w.Ward, head: num_(w['Head Count'])
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
        id, m.date, m.reference, m.wardId, m.type, m.quantity, m.officer || user.fullName,
        user.username, now_(), status, isAdmin ? user.fullName : '', isAdmin ? now_() : '',
        m.remarks, ''
      ]]);
      audit_(user.username, 'Recorded movement ' + id + ' (' + status + ')',
        m.type + ', ' + m.quantity + ' cards, ward ' + m.wardId);
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
          out.push([id, m.date, m.reference, m.wardId, m.type, m.quantity, m.officer || '',
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
      var wards = readTable_('wards');
      if (p.id) {
        var hit = findRow_('wards', 'Ward ID', p.id);
        if (!hit) throw new Error('Ward not found.');
        if (dupWard_(wards, w, p.id)) throw new Error('Another ward already has this name in the same community.');
        updateRow_('wards', hit.row, {
          'State': w.state, 'LGA': w.lga, 'Community': w.community, 'Ward': w.ward,
          'Head Count': w.head, 'Updated By': user.username, 'Updated At': now_()
        });
        audit_(user.username, 'Updated ward ' + p.id,
          'Head count ' + hit.row['Head Count'] + ' -> ' + w.head + '; ' + [w.state, w.lga, w.community, w.ward].join(' / '));
        return { id: p.id };
      }
      if (dupWard_(wards, w, null)) throw new Error('This ward already exists in the register.');
      var id = makeWardId_(wards, w);
      appendRows_('wards', [[id, w.state, w.lga, w.community, w.ward, w.head, user.username, now_()]]);
      audit_(user.username, 'Added ward ' + id, [w.state, w.lga, w.community, w.ward, 'head count ' + w.head].join(' / '));
      return { id: id };
    });
  },

  importWards: function (p, user) {
    requireRole_(user, ['admin']);
    return withLock_(function () {
      var rows = p.rows || [];
      var wards = readTable_('wards');
      var byId = {};
      wards.forEach(function (w, i) { byId[String(w['Ward ID'])] = i; });
      var errors = [], added = [], updated = 0;
      rows.forEach(function (r, i) {
        try {
          var w = validateWard_(r);
          var givenId = String(r.id || '').trim();
          if (givenId && byId.hasOwnProperty(givenId)) {
            var idx = byId[givenId];
            if (idx === -1) throw new Error('ward ID ' + givenId + ' appears twice in the file');
            updateRow_('wards', wards[idx], {
              'State': w.state, 'LGA': w.lga, 'Community': w.community, 'Ward': w.ward,
              'Head Count': w.head, 'Updated By': user.username, 'Updated At': now_()
            });
            updated++;
            return;
          }
          if (dupWard_(wards, w, null)) throw new Error('ward already exists (' + w.ward + ')');
          var id = givenId || makeWardId_(wards, w);
          var newRow = { 'Ward ID': id, State: w.state, LGA: w.lga, Community: w.community, Ward: w.ward, 'Head Count': w.head };
          wards.push(newRow);
          byId[id] = -1; // new in this batch
          added.push([id, w.state, w.lga, w.community, w.ward, w.head, user.username, now_()]);
        } catch (e) {
          errors.push('Row ' + (r._row || i + 2) + ': ' + e.message);
        }
      });
      if (added.length) appendRows_('wards', added);
      audit_(user.username, 'Imported wards', added.length + ' added, ' + updated + ' updated, ' + errors.length + ' skipped');
      return { added: added.length, updated: updated, errors: errors };
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
  return {
    date: date, type: type, quantity: quantity, wardId: wardId,
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
  var lga = requireText_(p.lga, 'LGA');
  var community = requireText_(p.community, 'Community');
  var ward = requireText_(p.ward, 'Ward name');
  var head = Number(String(p.head === undefined ? '' : p.head).replace(/,/g, ''));
  if (!(head >= 0) || Math.floor(head) !== head) throw new Error('Head count must be a whole number (0 or more).');
  return { state: state, lga: titleTrim_(lga), community: titleTrim_(community), ward: titleTrim_(ward), head: head };
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

function dupWard_(wards, w, exceptId) {
  var key = [w.state, w.lga, w.community, w.ward].join('|').toLowerCase();
  return wards.some(function (x) {
    return String(x['Ward ID']) !== String(exceptId) &&
      [x.State, x.LGA, x.Community, x.Ward].join('|').toLowerCase() === key;
  });
}

/** Builds an ID like LAG-IKE-01-W2 (state - LGA - community number - ward number). */
function makeWardId_(wards, w) {
  var code = function (s) { return String(s).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'XXX'; };
  var sc = code(w.state), lc = code(w.lga);
  var same = function (a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); };
  var communities = [];
  wards.forEach(function (x) {
    if (same(x.State, w.state) && same(x.LGA, w.lga)) {
      var c = String(x.Community).toLowerCase();
      if (communities.indexOf(c) < 0) communities.push(c);
    }
  });
  var ci = communities.indexOf(w.community.toLowerCase());
  if (ci < 0) { communities.push(w.community.toLowerCase()); ci = communities.length - 1; }
  var ids = {};
  wards.forEach(function (x) { ids[String(x['Ward ID'])] = true; });
  var n = wards.filter(function (x) {
    return same(x.State, w.state) && same(x.LGA, w.lga) && same(x.Community, w.community);
  }).length + 1;
  var id;
  do { id = sc + '-' + lc + '-' + pad_(ci + 1, 2) + '-W' + n; n++; } while (ids[id]);
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
    wardId: String(m['Ward ID']), type: m['Movement Type'], quantity: num_(m.Quantity),
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

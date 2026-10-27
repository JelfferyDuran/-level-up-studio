/* Level Up Studio — hardened storage (P0).
 *
 * The bug this fixes, in one line: pages trusted whatever they loaded into
 * memory and wrote it back wholesale, so a stale tab, a corrupt file, or a
 * half-shaped save all became the new truth and progress died.
 *
 * Rules enforced here:
 *  1. Versioned envelope + shape validation. Nothing untrusted is saved over.
 *  2. Corrupt saves are quarantined, never overwritten; the last good
 *     snapshot is restored and the page is told, instead of silently
 *     starting fresh.
 *  3. Rolling snapshots (last 3 good saves) as the rollback path.
 *  4. Merge on write, never blind overwrite: a newer stored revision wins
 *     by field (max for XP/stars/completed/best, union for done/quests).
 *  5. Rollover runs BEFORE any mutation, and "today" is computed at write
 *     time, so a quest completed after midnight credits the new day.
 *  6. Migration appends missing default quests (including Time Alone with
 *     God) idempotently, on every load and every refresh — never only once.
 *
 * Backward compatible: legacy bare-state JSON (no envelope) still loads,
 * treated as revision 0, and is re-saved as an envelope on the next save.
 * save() never mutates its input. Works in browsers (window.StudioStorage)
 * and in Node tests (module.exports). No dependencies.
 */
(function (root) {
  'use strict';

  var KEY = 'level-up-studio-pwa-v1';
  var SNAP_KEY = KEY + '.snapshots';
  var CORRUPT_PREFIX = KEY + '.corrupt.';
  var MAX_SNAPSHOTS = 3;

  var DEFAULT_QUESTS = [
    { id: 'sleep', emoji: '😴', name: 'Sleep 7h+', xp: 50 },
    { id: 'sprint', emoji: '🎯', name: 'Focus Sprint', xp: 50 },
    { id: 'mit', emoji: '✅', name: 'MIT done', xp: 40 },
    { id: 'break', emoji: '🌿', name: 'Real break', xp: 30 },
    { id: 'park', emoji: '📵', name: 'Phone parked', xp: 30 },
    { id: 'god', emoji: '🙏', name: 'Time Alone with God', xp: 50 },
    { id: 'read', emoji: '📚', name: 'Read 20 minutes', xp: 30 },
    { id: 'move', emoji: '🏃', name: 'Move 20 minutes', xp: 40 },
    { id: 'tidy', emoji: '🧹', name: 'Tidy 10 minutes', xp: 20 },
    { id: 'plan', emoji: '📝', name: 'Plan tomorrow', xp: 20 }
  ];

  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }
  function isDateStr(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  }
  function num(v, fallback) {
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  }
  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }
  function defaultState() {
    return {
      xp: 0, stars: 0,
      quests: clone(DEFAULT_QUESTS),
      done: [], date: dateKey(), history: {},
      completed: 0, best: 0, name: '',
      message: 'Small actions. Real momentum.',
      minutes: 25, stepDone: {}
    };
  }

  // Repair a parsed state in place. Numeric progress is NEVER discarded
  // because a list field broke: quests/done are rebuilt, xp/stars/history
  // are preserved whenever they are valid numbers.
  function repair(state) {
    var errors = [];
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return { state: defaultState(), errors: ['not-an-object'] };
    }
    state.xp = num(state.xp, 0);
    state.stars = num(state.stars, 0);
    state.completed = num(state.completed, 0);
    state.best = num(state.best, 0);
    if (!Array.isArray(state.quests)) {
      state.quests = [];
      errors.push('quests-rebuilt');
    }
    state.quests = state.quests.filter(function (q) {
      return q && typeof q.id === 'string' && typeof q.name === 'string' &&
        Number.isFinite(q.xp);
    }).map(function (q) {
      return { id: q.id, emoji: typeof q.emoji === 'string' ? q.emoji : '⭐',
        name: q.name, xp: q.xp };
    });
    if (!Array.isArray(state.done)) {
      state.done = [];
      errors.push('done-rebuilt');
    }
    state.done = state.done.filter(function (id) { return typeof id === 'string'; });
    if (!isDateStr(state.date)) {
      // An untrusted date means done cannot be trusted to belong to today.
      state.date = dateKey();
      state.done = [];
      errors.push('date-reset');
    }
    if (!state.history || typeof state.history !== 'object' || Array.isArray(state.history)) {
      state.history = {};
      errors.push('history-rebuilt');
    } else {
      Object.keys(state.history).forEach(function (k) {
        if (!Number.isFinite(state.history[k]) || state.history[k] < 0) state.history[k] = 0;
      });
    }
    if (!state.stepDone || typeof state.stepDone !== 'object' || Array.isArray(state.stepDone)) {
      state.stepDone = {};
      errors.push('stepDone-rebuilt');
    } else {
      Object.keys(state.stepDone).forEach(function (k) {
        if (!Array.isArray(state.stepDone[k])) state.stepDone[k] = [];
        state.stepDone[k] = state.stepDone[k].filter(function (i) { return Number.isFinite(i); });
      });
    }
    state.name = typeof state.name === 'string' ? state.name : '';
    state.message = typeof state.message === 'string' ? state.message :
      'Small actions. Real momentum.';
    state.minutes = Number.isFinite(state.minutes) && state.minutes >= 5 &&
      state.minutes <= 180 ? state.minutes : 25;
    return { state: state, errors: errors };
  }

  // Append any missing default quest without touching progress. Idempotent.
  function migrate(state) {
    var changed = false;
    if (!Array.isArray(state.quests)) state.quests = [];
    DEFAULT_QUESTS.forEach(function (dq) {
      if (!state.quests.some(function (q) { return q.id === dq.id; })) {
        state.quests.push(clone(dq));
        changed = true;
      }
    });
    if (!state.stepDone || typeof state.stepDone !== 'object') {
      state.stepDone = {};
      changed = true;
    }
    return changed;
  }

  function getStore(store) {
    if (store) return store;
    if (typeof localStorage !== 'undefined') return localStorage;
    return null;
  }
  function readRaw(store) {
    var s = getStore(store);
    if (!s) return null;
    try { return s.getItem(KEY); } catch (e) { return null; }
  }
  // Returns {state, rev, savedAt} or null. Accepts envelope or legacy bare state.
  function parseStored(raw) {
    if (!raw) return null;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v === 2 && parsed.state && typeof parsed.state === 'object') {
      return { state: parsed.state, rev: num(parsed.rev, 0), savedAt: num(parsed.savedAt, 0) };
    }
    // Legacy bare state (v1): no envelope, no revision.
    return { state: parsed, rev: 0, savedAt: 0 };
  }
  function readSnapshots(store) {
    var s = getStore(store);
    if (!s) return [];
    try {
      var arr = JSON.parse(s.getItem(SNAP_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeSnapshots(store, snaps) {
    var s = getStore(store);
    if (!s) return;
    try { s.setItem(SNAP_KEY, JSON.stringify(snaps.slice(-MAX_SNAPSHOTS))); } catch (e) {}
  }
  function pushSnapshot(store, envelope) {
    var snaps = readSnapshots(store);
    snaps.push(envelope);
    writeSnapshots(store, snaps);
  }
  function quarantine(store, raw) {
    var s = getStore(store);
    if (!s || raw === null) return;
    try { s.setItem(CORRUPT_PREFIX + Date.now(), raw); } catch (e) {}
  }
  // Latest valid snapshot state, or null.
  function restoreFromSnapshots(store) {
    var snaps = readSnapshots(store);
    for (var i = snaps.length - 1; i >= 0; i--) {
      var env = snaps[i];
      if (!env || !env.state) continue;
      var r = repair(clone(env.state));
      migrate(r.state);
      return { state: r.state, rev: num(env.rev, 0), savedAt: num(env.savedAt, 0) };
    }
    return null;
  }

  // Load with quarantine + snapshot recovery. Never silently returns fresh
  // over a damaged save: flags tell the page what happened.
  function load(store) {
    var raw = readRaw(store);
    if (raw === null || raw === undefined) {
      return { state: defaultState(), rev: 0, savedAt: 0, recovered: false, fresh: true };
    }
    var parsed = parseStored(raw);
    if (parsed === null) {
      // Unparseable: quarantine the bytes, restore last good snapshot.
      quarantine(store, raw);
      var snap = restoreFromSnapshots(store);
      if (snap) {
        return { state: snap.state, rev: snap.rev, savedAt: snap.savedAt,
          recovered: true, fresh: false, quarantined: true };
      }
      return { state: defaultState(), rev: 0, savedAt: 0,
        recovered: false, fresh: true, quarantined: true };
    }
    var r = repair(parsed.state);
    migrate(r.state);
    return { state: r.state, rev: parsed.rev, savedAt: parsed.savedAt,
      recovered: r.errors.length > 0, fresh: false, repairErrors: r.errors };
  }

  // Merge in-memory state (a) with a NEWER stored state (b). Field rules:
  // xp/stars/completed/best = max; history = per-day max; quests = union by
  // id (stored wins on conflict); date/done/stepDone = from the later date,
  // union when the date matches; name/message/minutes = from the newer save.
  function mergeStates(a, b) {
    var out = clone(a);
    out.xp = Math.max(num(a.xp, 0), num(b.xp, 0));
    out.stars = Math.max(num(a.stars, 0), num(b.stars, 0));
    out.completed = Math.max(num(a.completed, 0), num(b.completed, 0));
    out.best = Math.max(num(a.best, 0), num(b.best, 0));
    var hist = {};
    [a.history, b.history].forEach(function (h) {
      if (h && typeof h === 'object') Object.keys(h).forEach(function (k) {
        hist[k] = Math.max(hist[k] || 0, num(h[k], 0));
      });
    });
    out.history = hist;
    var quests = {};
    (Array.isArray(a.quests) ? a.quests : []).forEach(function (q) { quests[q.id] = q; });
    (Array.isArray(b.quests) ? b.quests : []).forEach(function (q) { quests[q.id] = q; });
    out.quests = Object.keys(quests).map(function (id) { return quests[id]; });
    var aDate = isDateStr(a.date) ? a.date : '';
    var bDate = isDateStr(b.date) ? b.date : '';
    if (bDate && bDate >= aDate) {
      out.date = bDate;
      if (bDate === aDate) {
        var doneSet = {};
        (Array.isArray(a.done) ? a.done : []).concat(Array.isArray(b.done) ? b.done : [])
          .forEach(function (id) { doneSet[id] = true; });
        out.done = Object.keys(doneSet);
        var steps = {};
        [a.stepDone, b.stepDone].forEach(function (sd) {
          if (sd && typeof sd === 'object') Object.keys(sd).forEach(function (k) {
            var set = {};
            (steps[k] || []).concat(Array.isArray(sd[k]) ? sd[k] : [])
              .forEach(function (i) { set[i] = true; });
            steps[k] = Object.keys(set).map(Number);
          });
        });
        out.stepDone = steps;
      } else {
        out.done = Array.isArray(b.done) ? b.done.slice() : [];
        out.stepDone = clone(b.stepDone || {});
      }
    } else {
      out.date = aDate;
      out.done = Array.isArray(a.done) ? a.done.slice() : [];
      out.stepDone = clone(a.stepDone || {});
    }
    // Newer save wins for preferences (b is newer by revision).
    if (typeof b.name === 'string') out.name = b.name;
    if (typeof b.message === 'string') out.message = b.message;
    if (Number.isFinite(b.minutes)) out.minutes = b.minutes;
    migrate(out);
    return out;
  }

  // Save with merge-on-write. Pure wrt the input state. Returns
  // {ok, state, rev}: callers MUST adopt the returned state+rev, because a
  // merge may have changed them. On failure the input is untouched and the
  // caller should reload from storage (see pages' save-failure path).
  function save(state, rev, store) {
    var s = getStore(store);
    if (!s) return { ok: false, state: state, rev: rev };
    var current = state;
    var stored = parseStored(readRaw(store));
    var newRev = num(rev, 0);
    if (stored && stored.rev > newRev) {
      current = mergeStates(state, stored.state);
      newRev = stored.rev;
    }
    newRev += 1;
    var envelope = { v: 2, rev: newRev, savedAt: Date.now(), state: clone(current) };
    try {
      s.setItem(KEY, JSON.stringify(envelope));
    } catch (e) {
      return { ok: false, state: state, rev: rev };
    }
    // Snapshot failure must never fail the main save.
    pushSnapshot(store, envelope);
    return { ok: true, state: clone(current), rev: newRev };
  }

  // Archive yesterday's done count into history and clear for today.
  // MUST run before any mutation that completes/undoes a quest.
  function rollover(state, now) {
    var today = dateKey(now);
    if (state.date === today) return false;
    var previous = state.date;
    if (previous && Array.isArray(state.done) && state.done.length) {
      state.history = state.history || {};
      state.history[previous] = state.done.length;
    }
    state.done = [];
    state.stepDone = {};
    state.date = today;
    return true;
  }

  // Re-read storage, merge if newer, migrate, roll over. Returns the state
  // the page should render from. Pages call this on pageshow,
  // visibilitychange (visible), and storage events — before rendering.
  function rehydrate(state, rev, store) {
    var loaded = load(store);
    var outState = state;
    var outRev = num(rev, 0);
    var changed = false;
    if (loaded.rev > outRev) {
      outState = mergeStates(state, loaded.state);
      outRev = loaded.rev;
      changed = true;
    } else if (loaded.recovered || loaded.quarantined) {
      // Storage was repaired or restored under us: trust the loaded state.
      outState = loaded.state;
      outRev = loaded.rev;
      changed = true;
    }
    if (migrate(outState)) changed = true;
    // Convergence: if memory holds quests the RAW stored state lacks (e.g.
    // a migration appended god in memory but nothing persisted it yet),
    // the page must persist so storage converges — otherwise a refresh
    // that reloads the raw state would drop the migrated quest again.
    // Compare against the raw stored quests, not load()'s migrated copy.
    var storedRaw = parseStored(readRaw(store));
    if (storedRaw && Array.isArray(storedRaw.state.quests)) {
      var storedIds = {};
      storedRaw.state.quests.forEach(function (q) { if (q && q.id) storedIds[q.id] = true; });
      outState.quests.forEach(function (q) { if (!storedIds[q.id]) changed = true; });
    }
    if (rollover(outState)) changed = true;
    return { state: outState, rev: outRev, changed: changed,
      recovered: !!loaded.recovered, quarantined: !!loaded.quarantined };
  }

  var api = {
    KEY: KEY, SNAP_KEY: SNAP_KEY,
    DEFAULT_QUESTS: DEFAULT_QUESTS,
    dateKey: dateKey, fresh: defaultState,
    repair: repair, migrate: migrate,
    load: load, save: save, mergeStates: mergeStates,
    rollover: rollover, rehydrate: rehydrate,
    parseStored: parseStored, restoreFromSnapshots: restoreFromSnapshots
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.StudioStorage = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

"use strict";

/*
 * love-habits — page logic.
 *
 * "Our Habits": tiny daily rituals for the two of us, with streaks, a weekly
 * grid and a soft thirty-day heatmap. Everything is kept in localStorage on
 * this device only — no tracking, no network calls.
 *
 * The computation lives in pure functions so it can be tested on its own:
 *   streak(checks, today) -> { current, best }
 *   heatmap(checks, opts) -> [{ date, on, ... }]
 */

(function () {
  var STORE = "mena-habits";

  var PALETTE = ["white", "pink", "purple", "gold", "sky", "mint"];

  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var WEEKDAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  // A gentle starter set, in case we'd rather not think one up.
  var SUGGESTIONS = [
    { name: "Drink a glass of water", icon: "💧", color: "sky" },
    { name: "A little walk outside", icon: "🌿", color: "mint" },
    { name: "Message each other good morning", icon: "🌅", color: "gold" },
    { name: "Read a few pages", icon: "📖", color: "purple" },
    { name: "Say one thing we're thankful for", icon: "✨", color: "white" },
    { name: "Ten quiet minutes away from screens", icon: "🕯", color: "pink" }
  ];

  var state = { habits: [] };

  /* ---------------- date helpers ---------------- */

  function pad2(n) { return String(n).padStart(2, "0"); }

  function dayISO(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function asDate(iso) {
    var parts = String(iso).split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function shiftDay(iso, delta) {
    var d = asDate(iso);
    d.setDate(d.getDate() + delta);
    return dayISO(d);
  }

  function weekdayShort(iso) { return WEEKDAYS_SHORT[asDate(iso).getDay()]; }

  function prettyDate(iso) {
    var d = asDate(iso);
    return WEEKDAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  /* ---------------- pure computation ---------------- */

  function countChecks(checks) {
    var n = 0;
    if (!checks) return 0;
    for (var k in checks) {
      if (Object.prototype.hasOwnProperty.call(checks, k) && checks[k]) n += 1;
    }
    return n;
  }

  /*
   * streak(checks, today)
   * checks: { "YYYY-MM-DD": true }
   * today:  "YYYY-MM-DD" (defaults to the real today)
   * Returns { current, best }.
   * `current` counts back from today; if today isn't ticked yet but yesterday
   * is, the run still counts from yesterday (a missed today isn't a broken run
   * until tomorrow). `best` is the longest run anywhere in the history.
   */
  function streak(checks, today) {
    checks = checks || {};
    today = today || dayISO();

    var days = Object.keys(checks).filter(function (k) { return checks[k]; }).sort();
    var best = 0;
    var run = 0;
    var prev = null;

    for (var i = 0; i < days.length; i += 1) {
      if (prev !== null && days[i] === shiftDay(prev, 1)) run += 1;
      else run = 1;
      if (run > best) best = run;
      prev = days[i];
    }

    var start = null;
    if (checks[today]) start = today;
    else if (checks[shiftDay(today, -1)]) start = shiftDay(today, -1);

    var current = 0;
    var cur = start;
    while (cur && checks[cur]) {
      current += 1;
      cur = shiftDay(cur, -1);
    }

    return { current: current, best: best };
  }

  /*
   * heatmap(checks, opts) -> [{ date, on, weekday, label }]
   * Oldest day first, ending on opts.today (default today).
   */
  function heatmap(checks, opts) {
    checks = checks || {};
    opts = opts || {};
    var days = isFinite(opts.days) && opts.days > 0 ? Math.floor(opts.days) : 30;
    var today = opts.today || dayISO();
    var out = [];
    for (var i = days - 1; i >= 0; i -= 1) {
      var d = shiftDay(today, -i);
      out.push({
        date: d,
        on: !!checks[d],
        weekday: asDate(d).getDay(),
        label: prettyDate(d)
      });
    }
    return out;
  }

  /* The last seven days, oldest first — the little weekly grid. */
  function weekGrid(checks, today) {
    checks = checks || {};
    today = today || dayISO();
    var out = [];
    for (var i = 6; i >= 0; i -= 1) {
      var d = shiftDay(today, -i);
      out.push({
        date: d,
        on: !!checks[d],
        wd: weekdayShort(d),
        label: prettyDate(d)
      });
    }
    return out;
  }

  function summary(habits, today) {
    habits = habits || [];
    today = today || dayISO();
    var doneToday = 0;
    var best = 0;
    var total = 0;
    habits.forEach(function (h) {
      var c = (h && h.checks) || {};
      if (c[today]) doneToday += 1;
      var s = streak(c, today);
      if (s.best > best) best = s.best;
      total += countChecks(c);
    });
    return {
      habits: habits.length,
      doneToday: doneToday,
      bestStreak: best,
      totalChecks: total
    };
  }

  /* ---------------- model helpers ---------------- */

  function clampStr(s, n) {
    s = String(s == null ? "" : s);
    return s.slice(0, n);
  }

  function makeId() {
    return "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function normalizeChecks(raw) {
    var out = {};
    if (raw && typeof raw === "object") {
      for (var k in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, k) && /^\d{4}-\d{2}-\d{2}$/.test(k) && raw[k]) {
          out[k] = true;
        }
      }
    }
    return out;
  }

  function normalizeHabit(raw) {
    if (!raw || typeof raw !== "object") return null;
    var color = PALETTE.indexOf(raw.color) >= 0 ? raw.color : "pink";
    return {
      id: typeof raw.id === "string" && raw.id ? clampStr(raw.id, 40) : makeId(),
      name: clampStr(raw.name, 60) || "A little habit",
      icon: clampStr(raw.icon, 4) || "🌱",
      color: color,
      notes: clampStr(raw.notes, 400),
      checks: normalizeChecks(raw.checks),
      createdAt: isFinite(raw.createdAt) ? Math.floor(raw.createdAt) : Date.now()
    };
  }

  /* ---------------- storage ---------------- */

  function load() {
    state.habits = [];
    var raw = null;
    try { raw = localStorage.getItem(STORE); } catch (e) { raw = null; }
    var s = null;
    if (raw) { try { s = JSON.parse(raw); } catch (e) { s = null; } }
    if (s && Array.isArray(s.habits)) {
      s.habits.forEach(function (h) {
        var norm = normalizeHabit(h);
        if (norm) state.habits.push(norm);
      });
    }
    return state;
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function findHabit(id) {
    for (var i = 0; i < state.habits.length; i += 1) {
      if (state.habits[i].id === id) return state.habits[i];
    }
    return null;
  }

  /* ---------------- actions ---------------- */

  function addHabit(name, icon, color) {
    name = clampStr(name, 60).trim();
    if (!name) return null;
    var habit = normalizeHabit({
      id: makeId(),
      name: name,
      icon: clampStr(icon, 4) || "🌱",
      color: color,
      notes: "",
      checks: {},
      createdAt: Date.now()
    });
    state.habits.push(habit);
    save();
    render();
    return habit;
  }

  function removeHabit(id) {
    for (var i = 0; i < state.habits.length; i += 1) {
      if (state.habits[i].id === id) {
        state.habits.splice(i, 1);
        save();
        render();
        return true;
      }
    }
    return false;
  }

  function toggleCheck(id, day) {
    var habit = findHabit(id);
    if (!habit) return false;
    day = day || dayISO();
    if (habit.checks[day]) delete habit.checks[day];
    else habit.checks[day] = true;
    save();
    render();
    return !!habit.checks[day];
  }

  function setNotes(id, text) {
    var habit = findHabit(id);
    if (!habit) return false;
    habit.notes = clampStr(text, 400);
    save();
    return true;
  }

  function seedSuggestions() {
    var added = 0;
    SUGGESTIONS.forEach(function (s) {
      var exists = state.habits.some(function (h) { return h.name === s.name; });
      if (!exists) {
        state.habits.push(normalizeHabit({
          id: makeId(), name: s.name, icon: s.icon, color: s.color,
          notes: "", checks: {}, createdAt: Date.now()
        }));
        added += 1;
      }
    });
    save();
    render();
    return added;
  }

  function resetAll() {
    state.habits = [];
    save();
    render();
  }

  /* ---------------- rendering ---------------- */

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function note(id, message) { setText(id, message); }

  function renderSummary() {
    var host = document.getElementById("summary-chips");
    if (!host) return;
    var s = summary(state.habits, dayISO());
    host.textContent = "";
    [
      ["Habits", s.habits],
      ["Done today", s.doneToday + " / " + s.habits],
      ["Best streak", s.bestStreak],
      ["All ticks", s.totalChecks]
    ].forEach(function (pair) {
      var chip = el("span", "habits-chip");
      var strong = el("strong");
      strong.textContent = String(pair[1]);
      chip.appendChild(strong);
      chip.appendChild(document.createTextNode(" " + pair[0]));
      host.appendChild(chip);
    });
  }

  function renderWeek(habit, host) {
    var grid = el("div", "habit-week");
    var today = dayISO();
    weekGrid(habit.checks, today).forEach(function (cell) {
      var box = el("div", "week-cell" + (cell.on ? " is-on" : "") + (cell.date === today ? " is-today" : ""));
      box.appendChild(el("span", "week-wd")).textContent = cell.wd;
      box.setAttribute("title", cell.label);
      grid.appendChild(box);
    });
    host.appendChild(grid);
  }

  function renderHeat(habit, host) {
    var map = el("div", "habit-heat");
    var today = dayISO();
    heatmap(habit.checks, { days: 30, today: today }).forEach(function (cell) {
      var dot = el("div", "heat-cell" + (cell.on ? " is-on" : "") + (cell.date === today ? " is-today" : ""));
      dot.setAttribute("title", cell.label + (cell.on ? " — done" : ""));
      map.appendChild(dot);
    });
    host.appendChild(map);
  }

  function renderHabit(habit) {
    var today = dayISO();
    var checked = !!habit.checks[today];
    var s = streak(habit.checks, today);

    var card = el("article", "habit" + (checked ? " is-done-today" : ""));
    card.setAttribute("data-id", habit.id);
    card.setAttribute("data-color", habit.color);

    var head = el("div", "habit-head");

    var icon = el("span", "habit-icon");
    icon.textContent = habit.icon;
    head.appendChild(icon);

    var title = el("div", "habit-title");
    title.appendChild(el("h3")).textContent = habit.name;
    var sub = el("span", "habit-sub");
    sub.textContent = checked ? "done today ♥" : (s.current > 0 ? s.current + " day streak" : "not yet today");
    title.appendChild(sub);
    head.appendChild(title);

    var check = el("button", "habit-check");
    check.type = "button";
    check.textContent = checked ? "✓ Done" : "Tick today";
    check.setAttribute("aria-label", (checked ? "Undo " : "Mark ") + habit.name);
    check.addEventListener("click", function () {
      var nowOn = toggleCheck(habit.id, today);
      note("list-note", nowOn ? "Lovely — " + habit.name + " is done ♥" : "Un-ticked, no worries.");
    });
    head.appendChild(check);

    var del = el("button", "habit-del");
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("aria-label", "Remove " + habit.name);
    del.addEventListener("click", function () {
      removeHabit(habit.id);
      note("list-note", "Removed " + habit.name + ".");
    });
    head.appendChild(del);

    card.appendChild(head);

    var stats = el("div", "habit-stats");
    [
      ["Current", s.current + "d"],
      ["Best", s.best + "d"],
      ["Total", countChecks(habit.checks) + "d"]
    ].forEach(function (pair) {
      var chip = el("span", "habit-stat");
      var strong = el("strong");
      strong.textContent = pair[1];
      chip.appendChild(document.createTextNode(pair[0] + " "));
      chip.appendChild(strong);
      stats.appendChild(chip);
    });
    card.appendChild(stats);

    renderWeek(habit, card);
    renderHeat(habit, card);

    var noteWrap = el("label", "habit-notes");
    noteWrap.appendChild(el("span")).textContent = "A line to ourselves";
    var area = el("textarea");
    area.rows = 2;
    area.maxLength = 400;
    area.value = habit.notes || "";
    area.setAttribute("aria-label", "Notes for " + habit.name);
    area.addEventListener("input", function () {
      setNotes(habit.id, area.value);
      note("list-note", "Noted.");
    });
    noteWrap.appendChild(area);
    card.appendChild(noteWrap);

    return card;
  }

  function render() {
    var list = document.getElementById("habit-list");
    if (list) {
      list.textContent = "";
      if (!state.habits.length) {
        var empty = el("p", "habit-empty");
        empty.textContent = "Nothing here yet — add a habit above, or let us suggest a few.";
        list.appendChild(empty);
      } else {
        state.habits.forEach(function (h) { list.appendChild(renderHabit(h)); });
      }
    }
    renderSummary();
  }

  /* ---------------- events ---------------- */

  function wire() {
    var add = document.getElementById("add-habit");
    if (add) add.addEventListener("click", function () {
      var nameEl = document.getElementById("habit-name");
      var iconEl = document.getElementById("habit-icon");
      var colorEl = document.getElementById("habit-color");
      var name = nameEl ? String(nameEl.value).trim() : "";
      if (!name) {
        note("add-note", "Give it a name first ♥");
        return;
      }
      addHabit(name, iconEl ? iconEl.value : "🌱", colorEl ? colorEl.value : "pink");
      if (nameEl) nameEl.value = "";
      note("add-note", "Added — it'll be here tomorrow too.");
    });

    var seed = document.getElementById("seed-button");
    if (seed) seed.addEventListener("click", function () {
      var added = seedSuggestions();
      note("save-note", added ? "Added " + added + " gentle suggestions ♥" : "You already have them all.");
    });

    var reset = document.getElementById("reset-habits");
    if (reset) reset.addEventListener("click", function () {
      resetAll();
      note("save-note", "Cleared — a quiet, empty start.");
    });

    var share = document.getElementById("share-button");
    if (share) share.addEventListener("click", function () {
      var url = window.location.href;
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(function () { note("save-note", "Link copied ♥"); })
          .catch(function () { note("save-note", url); });
        return;
      }
      note("save-note", url);
    });
  }

  /* ---------------- boot ---------------- */

  document.addEventListener("DOMContentLoaded", function () {
    load();
    render();
    wire();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }
  });

  /* Expose the pure functions + a little of the state machine for tests. */
  window.MenaHabits = {
    STORE: STORE,
    PALETTE: PALETTE,
    SUGGESTIONS: SUGGESTIONS,
    dayISO: dayISO,
    asDate: asDate,
    shiftDay: shiftDay,
    weekdayShort: weekdayShort,
    prettyDate: prettyDate,
    countChecks: countChecks,
    streak: streak,
    heatmap: heatmap,
    weekGrid: weekGrid,
    summary: summary,
    normalizeHabit: normalizeHabit,
    load: load,
    save: save,
    addHabit: addHabit,
    removeHabit: removeHabit,
    toggleCheck: toggleCheck,
    setNotes: setNotes,
    seedSuggestions: seedSuggestions,
    resetAll: resetAll,
    state: state
  };
})();

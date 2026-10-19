"use strict";

/*
 * love-habits — dependency-free Node test harness.
 * Run:  node test/harness.js
 * Loads js/app.js in a fake-DOM sandbox and checks the pure functions.
 */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const store = {};
const el = () => ({
  style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {},
  appendChild() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {},
  querySelector: () => null, querySelectorAll: () => [], focus() {}, remove() {},
  innerHTML: "", textContent: "", value: ""
});

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Intl,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => el(),
    createTextNode: (t) => ({ textContent: String(t) }),
    addEventListener() {},
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } }
  },
  navigator: { language: "en", clipboard: { writeText: async () => {} } },
  requestAnimationFrame: (fn) => setTimeout(fn, 0)
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = process.argv.slice(2);
for (const f of (files.length ? files : ["js/app.js"])) {
  vm.runInContext(fs.readFileSync(path.resolve(f), "utf8"), sandbox, { filename: f });
}

/* ------------------------------ assertions ------------------------------ */

const NS = sandbox.window.MenaHabits;
let passed = 0;
let failed = 0;

function ok(cond, msg) {
  if (cond) { passed += 1; console.log("ok - " + msg); }
  else { failed += 1; console.error("FAIL: " + msg); process.exitCode = 1; }
}

function eq(actual, expected, msg) {
  ok(actual === expected, msg + " (got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected) + ")");
}

/* namespace */
ok(!!NS, "namespace window.MenaHabits is exposed");
eq(NS.STORE, "mena-habits", "storage key is mena-habits");
ok(typeof NS.streak === "function", "streak() is a function");
ok(typeof NS.heatmap === "function", "heatmap() is a function");

/* date helpers */
eq(NS.dayISO(new Date(2026, 4, 20)), "2026-05-20", "dayISO pads month/day");
eq(NS.shiftDay("2026-03-01", -1), "2026-02-28", "shiftDay rolls back over a month");
eq(NS.shiftDay("2026-02-28", 1), "2026-03-01", "shiftDay rolls forward over a month");
eq(NS.weekdayShort("2026-05-20"), "We", "weekdayShort(2026-05-20) is We");

/* streak — current and best */
const T = "2026-05-20";
const runChecks = {
  "2026-05-18": true, "2026-05-19": true, "2026-05-20": true,            // current: 3
  "2026-05-10": true, "2026-05-11": true, "2026-05-12": true,
  "2026-05-13": true, "2026-05-14": true                                 // best: 5
};
const s1 = NS.streak(runChecks, T);
eq(s1.current, 3, "streak.current counts back from today");
eq(s1.best, 5, "streak.best finds the longest run");

/* grace: today not ticked yet, yesterday ticked */
const s2 = NS.streak({ "2026-05-19": true, "2026-05-18": true }, T);
eq(s2.current, 2, "streak.current counts from yesterday when today is unticked");

/* a gap breaks the run */
const s3 = NS.streak({ "2026-05-20": true, "2026-05-18": true }, T);
eq(s3.current, 1, "streak.current stops at a missing day");
eq(s3.best, 1, "streak.best is 1 for isolated days");

/* month rollover inside one run */
const s4 = NS.streak({
  "2026-02-27": true, "2026-02-28": true, "2026-03-01": true, "2026-03-02": true
}, "2026-03-02");
eq(s4.best, 4, "streak.best counts across a month boundary");

/* empty / falsy */
const s5 = NS.streak({}, T);
eq(s5.current, 0, "streak.current is 0 with no checks");
eq(s5.best, 0, "streak.best is 0 with no checks");

/* false values are ignored */
eq(NS.streak({ "2026-05-20": false }, T).current, 0, "falsy check values are ignored");

/* heatmap */
const hm = NS.heatmap({ "2026-05-20": true }, { days: 7, today: T });
eq(hm.length, 7, "heatmap returns the requested number of days");
eq(hm[hm.length - 1].date, T, "heatmap ends on today");
eq(hm[0].date, NS.shiftDay(T, -6), "heatmap starts six days before today");
eq(hm[hm.length - 1].on, true, "heatmap marks today when ticked");
eq(hm[0].on, false, "heatmap leaves unticked days off");
eq(NS.heatmap({}, {}).length, 30, "heatmap defaults to 30 days");

/* week grid */
const wk = NS.weekGrid({ "2026-05-20": true }, T);
eq(wk.length, 7, "weekGrid returns seven days");
eq(wk[6].date, T, "weekGrid ends on today");
eq(wk[6].wd, "We", "weekGrid labels weekdays");
eq(wk[6].on, true, "weekGrid marks today when ticked");

/* summary */
const sum = NS.summary([
  { checks: runChecks },
  { checks: { "2026-05-20": true } }
], T);
eq(sum.habits, 2, "summary counts habits");
eq(sum.doneToday, 2, "summary counts habits done today");
eq(sum.bestStreak, 5, "summary reports the best streak across habits");
eq(sum.totalChecks, 9, "summary totals every tick");

/* normalizeHabit sanitises junk */
const norm = NS.normalizeHabit({
  name: "  Water  ", color: "bogus",
  checks: { "2026-05-20": true, "nope": true, "2026-05-19": false }
});
eq(norm.color, "pink", "normalizeHabit falls back to pink for unknown colours");
eq(norm.name, "  Water  ", "normalizeHabit keeps the name verbatim");
eq(NS.countChecks(norm.checks), 1, "normalizeHabit drops invalid and falsy checks");
ok(!!norm.id && !!norm.createdAt, "normalizeHabit assigns id and createdAt");

/* round-trip through the store */
NS.resetAll();
eq(NS.state.habits.length, 0, "resetAll empties the habits");
const added = NS.addHabit("Drink water", "💧", "sky");
ok(!!added && added.id, "addHabit returns the new habit");
eq(NS.state.habits.length, 1, "addHabit appends to state");
NS.toggleCheck(added.id, "2026-05-20");
eq(NS.countChecks(NS.state.habits[0].checks), 1, "toggleCheck marks a day");
NS.setNotes(added.id, "felt good");
NS.save();
NS.state.habits = []; // forget in memory only, then read back from the store
NS.load();
eq(NS.state.habits.length, 1, "load restores what save persisted");
eq(NS.state.habits[0].name, "Drink water", "persisted habit keeps its name");
eq(NS.state.habits[0].color, "sky", "persisted habit keeps its colour");
eq(NS.state.habits[0].notes, "felt good", "persisted habit keeps its notes");
eq(NS.countChecks(NS.state.habits[0].checks), 1, "persisted habit keeps its ticks");

/* seed + remove */
NS.resetAll();
const seeded = NS.seedSuggestions();
ok(seeded > 0, "seedSuggestions adds at least one habit");
eq(NS.state.habits.length, seeded, "seedSuggestions adds the suggested habits");
eq(NS.seedSuggestions(), 0, "seedSuggestions is idempotent");
eq(NS.removeHabit(NS.state.habits[0].id), true, "removeHabit deletes a habit");

console.log("\n" + passed + " passed, " + failed + " failed");

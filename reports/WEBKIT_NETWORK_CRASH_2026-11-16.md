# The journeys' WebKit lost its network process — 2026-11-16

Not a stage report: an investigation of the CI job "UI and API journeys (3/3)", which failed on
most runs of 2026-11-16 in a different iPad or WebKit journey each time. Branch
`claude/blissful-bell-crso4v`, pull request 61. Session model: Claude Fable 5.2.

## The cause

In the WebKit that Playwright 1.63.0 ships for Linux (build 2359, its own libsoup 3.6.5, the
system's glib 2.80), **the network process of a page's browser corrupts its heap when the page
aborts a fetch**, and glibc ends the process at the next allocation that meets the damage. The
client aborts fetches all the time (a superseded read, a replaced live stream), so every WebKit
journey ran this risk on every screen.

A page whose network process died loses every request in flight ("WebKit encountered an internal
error"), the dev client's socket ("Network process crashed") and what the browser kept for it in
the session — an open sheet's name, the break reminder's count. The journey then waits for a
screen that never comes, wherever it happened to be. Each page has its own network process, which
is why one page of a journey showed the failures and the others did not.

The fix is the browser: **Playwright 1.65.1** (WebKit build 2388, libsoup 3.6.6) does not crash on
the same journeys: `package.json` and the lockfile change. With the crash out of the way a
second, smaller cause of red runs showed, in the client; it is answered below too.

## The evidence

**CI's own logs** (nothing else of a run is kept). Of the thirteen failed journey jobs read, four
ran after "A journey that fails says what its pages were at" and all four show it: jobs
133577334885 (`claude/native-tv-polish`), 133581635414 (`claude/break-resume-race`), 133623708483
(pull request 48, `main` plus documents) and 133630746689 (`claude/stage-810-short-way-to-a-pause`)
— requests ending in "WebKit encountered an internal error", two of them with the console's
"WebSocket network error: Network process crashed". The nine before that commit print nothing of
their pages and are not attributed.

**A lab run on the hosted runner** (run 43968923122, this branch's temporary workflow; the third
shard and the WebKit projects alone, each printing the kernel log, memory and network processes
every two seconds, the browser's stderr and a core dump's backtrace):

- the browser's stderr at each failure: `malloc_consolidate(): unaligned fastbin chunk detected`,
  `GLib-CRITICAL: g_atomic_rc_box_release_full: assertion 'real_box->magic == G_BOX_MAGIC' failed`;
- a core dump of `WPENetworkProcess` per failure, ended by `abort()` under `malloc`, called from
  libsoup (`soup_session_send_async`, `soup_headers_parse_response`);
- the runner had four cores and 16 GB; in the three failed jobs read the least memory available
  in any sample was 4.3 GB, the kernel log names no killed process, and a network process held
  about thirty open files.

**The same crash on a workstation-class machine** (a cloud container, 4 cores, 16 GB, 15 GB free;
`tests/e2e/dm-screen.spec.ts` in the `ipad` project, the dev server as in CI, one run = four
journeys):

| What ran                                                                 | Runs that lost a network process  |
| ------------------------------------------------------------------------ | --------------------------------- |
| Playwright 1.63.0 as on `main`, a trace recorded                         | 5 of 6                            |
| the same, no trace (`--trace off`)                                       | 12 of 15                          |
| the same, `AbortController.prototype.abort` made a no-op in `index.html` | 0 of 6                            |
| the same, the built client instead of the dev server (`vite preview`)    | 0 of 6 (one at a browser's close) |
| Playwright 1.65.1, nothing else changed                                  | 0 of 6                            |

With glib's debug symbols one dump ends in `g_task_finalize` → `g_atomic_rc_box_release_full` →
"assertion failed": a task releasing something already released. The others end in `malloc`,
`realloc` or `g_object_ref` on an object that is no longer one, each in a different place — what a
heap damaged earlier looks like.

## What was ruled out

- **Memory pressure on the runner**: 4 GB free at the worst, no kill in the kernel log, and the
  crash comes as readily on a machine with 15 GB free and one journey running.
- **The dev client's WebSocket and the dev server as such**: the built client has neither and
  still crashed on CI (2 of 3 lab jobs red; the one read has the same stderr and a core dump). The
  dev server makes it likelier — a page load is about a thousand requests there, and reads queue
  behind them — it is not the cause.
- **The event stream through the dev proxy**: with aborts off, the same stream through the same
  proxy runs without a crash on 1.63.0, and it does on 1.65.1 as it is.
- **Recording a trace**: no difference, here (table) or on CI (1 of 3 lab jobs red without one).
- **The runner's image or system libraries**: both images of the day (20261111.127.1 and
  20261111.370.1) fail; libsoup is the browser's own; the system's glib package dates from
  September.
- **The number of iPad journeys in a shard**: it is exposure, not cause. One journey file alone
  crashes four runs in five.

## Why since 2026-11-16

Nothing about the browser changed that day. Two things about the suite did: Stages 710–799 took
the WebKit projects from six journeys to about twenty, and "The dev client keeps its connection;
only its reload is taken out" removed what had hidden the crash — until then the dev client
reloaded a page whose socket closed, and most journeys walked on from the reloaded page. That the
socket "closed now and then in WebKit" was this crash.

## The fix, and what CI said of it

`@playwright/test` 1.63.0 → 1.65.1 (the lockfile's four Playwright entries). For the crash,
nothing of the journeys, their servers or the client changes; the one-worker rule for the WebKit
projects and `LTW_VITE_NO_RELOAD` stay as they are.

Two rounds, the lab still beside the change (commits `2d572162` and `d068e796`; the second
differs from the first in documents only):

| Where                                                            | The WebKit journeys       | The job            |
| ---------------------------------------------------------------- | ------------------------- | ------------------ |
| CI, runs 43978693958 and 43982212401, all eight jobs each        | 18 of 18 both times       | green, "CI passed" |
| lab, runs 43978688662 and 43982206352: the third shard, 12 times | 18 of 18 in 11, 17 in one | 10 green, 2 red    |
| lab, the same runs: the WebKit projects alone, 8 times           | 18 of 18 each time        | 8 green            |
| the container: the WebKit projects alone, three times            | 18, 17 and 18 of 18       | —                  |

No network process died: in the eleven lab jobs whose reports were read (the first round's ten
and the second's red one) there is no heap message in the browsers' stderr, no request lost to a
dead network process and no core dump; the second round's nine green jobs were not read past
their result. Before the change, the same lab on 1.63.0 (run 43968923122) had the third shard red
in three of four jobs and the WebKit projects alone red in two of three.

So the third shard went from red most of the time to green in 12 runs of 14. The two red ones
are other failures, which the crash had been standing in front of.

## The second cause: a screen that shows one code and holds another

Both red jobs have a Chromium journey whose TV stayed at its pairing code after the DM paired it
(`native-polish.spec.ts:58`, job 133689370207; `release.spec.ts:86`, job 133701234043 — there the
DM's sheet already said "The screen is paired").

The page of the table's screen asked for its code twice when it loaded — in development React
runs an effect twice, and the journeys' servers are development ones — and each answer sets the
screen's cookie. The page showed the code of the request made last; the browser kept the cookie
of the answer that came last. When the first answer overtook nothing, the two agreed; when it
came after the second, the DM typed a code the screen no longer answered for, and the screen
asked "am I paired?" for the other one for good.

Shown, not inferred: with the first answer held back by a route, the page asked twice, showed the
second code and its `GET /display/session` answered with the first one's expiry.
`apps/web/src/display/display-app.tsx` now shares one request among whoever asks while it is on
its way, and `tests/e2e/display-pairing.spec.ts` holds it (it fails on the old client: two codes
asked). A built client asks once at load, so a real TV was not at risk from this path; nothing was
run on one.

Whether Chromium 159 answers in that order more often than 153 did is not known: no job on 1.63.0
among the sixteen read shows it, two of fourteen on 1.65.1 do.

## What else failed, and is not explained

- **CI, lab job 133701234043, WebKit**: `comforts.spec.ts:129`, line 182 — the break's card was
  there with its words and was not focused ("inactive", fourteen looks in five seconds). No sign
  of the crash. Once in 22 runs of the journey on the new browser. The card takes the focus in
  the same moment the lobby is read again (`apps/web/src/comforts/break-reminder.tsx`); whether
  that is the reason was not tested.
- **The container, WebKit**: `campaign-book.spec.ts:63`, once in three whole runs — the chapter in
  the book lacked the line the DM had typed before "Yes, end the session" (line 140, the default
  five seconds). Alone, the journey passed eight times of eight there; not seen on CI in 22 runs.

## Not verified

- **Which abort does it.** Turning every abort off stops the crash; whether the live stream's or
  a plain read's is the one was not separated. A bare page aborting fetches against a bare server
  (150 rounds of forty reads, with and without a stream) did not crash 1.63.0's WebKit: the
  trigger needs something more of the client than that, and was not reduced further.
- **Where in WebKit or libsoup the bug is**, and that 1.65.1 fixed it rather than made it rare.
  The browser's libraries carry no symbols. The claim rests on counts: 0 of 6 against 17 of 21
  locally, and CI's runs above.
- **Safari itself.** The crash is in the Linux port's network process (libsoup); Safari on an iPad
  or a Mac uses another network stack. Nothing here was run on a real device.
- **Chromium on 1.65.1 beyond two whole CI runs** of all three shards and the third shard's
  fourteen: its Chromium is six versions newer than 1.63.0's.
- **Failures of other causes** in the jobs read before the journey logging existed.

## The open pull requests

Pull requests 48–60 run the old browser until they hold this change: re-running them as they are
is the same lottery. They go green by merging this pull request to `main` and merging `main` into
each (or by carrying the two changed files), which this session was not allowed to do.

## Afterwards, the owner's choice

- The one-worker rule of the WebKit projects (`playwright.config.ts`) was set the same day for
  screens that "had not caught up". With the crash gone it may no longer be needed; it was not
  re-tested here.
- `LTW_VITE_NO_RELOAD` stays useful: it is what made the crash visible instead of a silent reload.

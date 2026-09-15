# Running med school in SetATime

You already had every piece. What was missing was a container — something
that holds "the research paper" as one thing instead of as seven unrelated
tasks scattered across the Hold, the week board, and today's plan.

That container is **Projects**. This doc is the operating manual.

## The layers, top to bottom

| Layer | Answers | Where |
|---|---|---|
| North Stars | Who am I becoming? | Charts → Stars |
| **Projects** | What outcomes am I steering? | **Projects tab** |
| Week board | What moves those this week? | Today → This week |
| Today's plan | What am I doing today? | Today → Today's plan |
| Underway | What am I doing *right now*? | Sail → Underway |

Each layer feeds the one below it. You should almost never add work at
the bottom without it having come from somewhere above — the exception is
Hold, which exists precisely so you can capture without deciding.

## Setup — once a term, about 20 minutes

Make one project per real thing:

- **One per course block.** Kind: `Course`. The risk here is falling
  behind on a calendar you don't control.
- **Step 1.** Kind: `Board prep`. The risk is that it's never urgent, so
  it never starts. Give it a next action that is embarrassingly small.
- **The research project.** Kind: `Research`. The risk is stalling
  silently for six weeks between PI emails.
- **Each org/clinical commitment you actually said yes to.** Kind:
  `Clinical`. The risk is double-booking.
- **One for compliance modules.** Kind: `Compliance`. The risk is pure
  forgetting — small effort, hard deadline, real consequences.

Then put every date you don't control into **Milestones**: exam dates,
module deadlines, IRB submission, abstract cutoffs. This is the only part
that takes real work, and you only do it once per term.

## The rhythm

**Sunday, ~10 minutes.** Open the Projects tab and walk it top to bottom.
For each project ask one question: *what moves this next week?* Put the
answers on the week board and tag each with its project. Anything you
can't honestly fit, drop — the drop counter exists to make that a win.

**Every morning, ~2 minutes.** Promote from the week board into today's
1/3/5. A rule of thumb that keeps the week survivable:

- **Big** goes to the nearest deadline.
- One **Medium** goes to whichever project would otherwise stall.
- **Smalls** are where compliance modules go to die quietly.

**In the moment.** The capture bar at the bottom of every screen logs to
Hold. Don't sort it there — sort it Sunday. Hold is the pressure valve;
the board is the plan.

**When you can't start.** Sail → Underway. Two minutes counts. A project
with a next action already written down is one you can start without
deciding anything first — that's the entire reason the field exists.

## Arranging Today

Today has a lot on it, and which parts earn their place is personal. Tap
**Arrange** in the Today header to open the list of all twelve sections.

Each row gives you four moves:

- **↑ / ↓** — nudge it one position.
- **📌** — jump it straight to the top. Use this for the one or two you
  reach for constantly; with arrows alone it costs a tap per position,
  which is exactly the friction you can't afford on a bad day.
- **Shown / Tucked** — tucked sections live behind *show more on today*
  rather than disappearing. The disclosure always sits immediately above
  the first tucked thing, whatever order you choose.

The order syncs across your devices, so you arrange it once. **↺ Reset
order** puts it back.

A reasonable starting move: pin **Log a moment** to the top during a hard
block, so checking which state you're in is the first thing you see rather
than something you have to go looking for.

## When the problem is your state, not your plan

Two different failures get confused constantly, and they need opposite
responses:

| You are… | Looks like | Go to |
|---|---|---|
| **Hyper** | Racing, jaw tight, can't settle, scrolling without reading | Regulate → bring it down |
| **In the window** | Can think and feel at once; hard things feel hard, not impossible | Nothing to fix — Stuck, if you can't start |
| **Hypo** | Foggy, flat, staring, everything far away | Regulate → bring it up |

**Log it on Today** — the "Log a moment" card, under *show more on today*.
Each of the three cards lists the body cues, because the hard part is
recognising which one you're in, not tapping the button. Both ends feel
like "bad", and a calming exercise does nothing when you are already shut
down.

If you log hyper or hypo, your resets for that direction appear right
there. Tap one and it is recorded against the entry, so over time
**Sail → Regulate** shows which of your own moves you actually reach for —
`used 4×` beside the ones that are real rather than aspirational.

**Regulate is the library; Stuck is for inertia.** If you are in the
window and still not starting, that is a different problem and the Stuck
chips are the right tool. Each screen links to the other, so a wrong guess
costs one tap.

## When you can't make yourself start

Sail → Lab → **Rubicon**. Use it for the specific failure where you know
exactly what you should do and still don't begin — not for fear (that's
**Leap**) and not for a gut-check (**Quick**/**Deep**).

It walks the four action phases of the Rubicon model in order, because
running them out of order is what makes goals stall:

1. **Deliberate** — the wish, whose goal it actually is, and desirability
   × feasibility. If feasibility reads low, the model's answer is to
   *not* commit yet: shrink the wish first.
2. **Cross** — state it as a commitment and stop weighing. Deliberating
   and doing are different mindsets and the switch has to be deliberate.
3. **Plan** — the inner obstacle, then an if-then that answers it, with a
   real time and place.
4. **Shield** — what happens when something pulls you away.

The reflection, due the next day, closes it: how far you got, whether the
if-then actually fired, and whether the goal still feels like yours.

The second step is the one that does the work. A goal you can only
describe as someone else's, or as guilt, predicts weak follow-through
regardless of how good the plan underneath it is — so the honest answer
there saves you the next four steps. Backburner is still a legitimate
answer.

## The one rule

**Every active project has a next action, or a deadline within reach.**

If it has neither, the Projects tab marks it `stalled` and the tab badge
counts it. That isn't a scolding — it's the list telling you a decision is
overdue. You have exactly two honest responses:

1. Give it a next action, or
2. Move it to **Backburner** and stop paying rent on it.

Backburner is not failure. It's the difference between five projects you
are actually running and eleven you feel vaguely guilty about.

## Where projects show up

- **Projects tab** — the full board, milestones, status, next actions.
  The badge counts stalled projects.
- **Today → Coming due** — appears only when something is due within a
  week or has stalled. If nothing is pressing, the strip doesn't render.
- **Plan rows, week-board rows, Hold rows** — a small colored chip (or
  dot, on the dense week-board rows). Tap it to file or refile a task.
- **North Stars** — a project can declare which Star it serves, so the
  values layer connects to the daily one.

## Notes on the data

Every link is optional in both directions. `projectId` is optional on
dump tasks, plan tasks, week-board items, and calendar blocks;
`northStarIds` is optional on projects. Existing data is untouched, and
an untagged task behaves exactly as it always did. Nothing about this
layer is load-bearing until you choose to use it.

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

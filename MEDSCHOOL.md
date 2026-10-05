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

## Mapping a lecture

**Charts → Maps**, or **Map it** on any row of the Lectures page — that
seeds a map with the lecture's title already at the centre.

The rule of the surface is that you never place anything. You type, and it
lays itself out:

- **Tab** — new branch off whatever's selected
- **Enter** — new sibling
- **Shift+Tab** or **[** — move it out a level · **]** — move it in
- **Delete** — remove it and everything under it

Every move has a button too, so it works one-handed on a phone.

Use it in the ten minutes *after* a lecture, while the shape is still in
your head — that's the window this exists for. A map isn't notes; it's the
skeleton you hang notes on, and if it takes longer than the gap between
sessions it won't happen.

### Labels instead of lecture tags

Tap **Label** in the bar and type whatever you want — "Lec 4", "Week 2",
"Exam 1". Everything you type from then on carries it, and labels already in
the tree are offered as one-tap suggestions. There is no list to pick from
and no lecture to keep track of.

Labels do everything lecture tags did: the **Label** strip filters the
canvas, **Export → Include** prints one label's material, and **Split pages
by → Labels** gives each one its own pages. Maps tagged before labels
existed keep working — a lecture title reads as a label until you type over
it.

### One tree per course

**Map it** on a lecture row no longer starts a fresh map. It opens that
course's tree, adds the lecture as a **section** inside it, and makes it the
**working lecture** — so everything you type next is tagged to that session
without you doing anything.

That is the whole trick behind the big picture. One tree holds the course;
each lecture's material lives inside it under whatever heading it actually
belongs to, not under the date it happened to be taught. Later you can pull
one session back out:

- The **Lecture** strip filters the canvas. Everything outside the chosen
  lecture dims rather than vanishing, so you see your part *and* where it
  sits.
- **Export → Include** prints just that lecture's nodes, plus the branches
  above them for context. The file is named after both.

Maps you made before this existed aren't stranded: **Move into another map**
on the list folds one into another. Its nodes move across and become a
section, nothing is copied, and the old map goes away.

### Colouring lectures so you can see them overlap

The row of pills next to the depth buttons — **Branch / Section / Label** —
decides what colour means on this map. It is stored per map, so a
single-lecture map and the course tree can answer differently.

**Branch** is how it always worked: colour comes from which top-level
branch a node sits under.

**Section** is the default. Select a section, tap **Colour**, pick one, and
that section plus everything beneath it takes it. A colour set further
down overrides the one above, so a sub-topic can have its own without
leaving its section. **Clear** goes back to inheriting. With no colours
set anywhere it falls through to the branch rule, so an untouched map
looks exactly as it did.

This shows **territory** — where each lecture's material lives in the
tree.

**Label** colours each node by its own label instead, wherever it sits. If
you are in Lecture 7 and add detail into a branch you built during
Lecture 3, Section mode paints it Lecture 3's colour because that is
whose section it is in; Label mode paints it Lecture 7's. So Label is the
one that shows **reinforcement** — the places two lectures have both
touched the same part of the tree. Flipping between the two is worth
doing before an exam: Section tells you what a lecture covered, Label
tells you what keeps coming back.

Whatever is on screen is what prints. A label keeps the same colour in a
focused or spliced export as in the whole map, so "Lec 4 is the cyan one"
stays true across every PDF.

#### Six colours, and why not more

The palette has six, chosen by measuring: they were picked to maximise how
far apart the closest pair is, then checked against both the white canvas
and the dark one. The six that shipped before were much worse than they
looked — indigo and violet were, measurably, the same colour.

Past six labels, the rest stay grey rather than starting the palette
again, because two lectures sharing a colour is worse than one having
none. If you have more lectures than that, use Section colours to pin the
handful you actually want to compare.

Colour is never the only signal. No six hues survive red-green colour
blindness — that is a limit of the eye, not of the palette — so the strip
above the canvas names every colour, and each node still carries its own
text.

### Finding your way around a big tree

Four controls, all in the strip under the title or the bar at the bottom:

- **1 / 2 / 3 / ∞** — show that many levels. Depth 2 is the big picture;
  ∞ opens everything.
- **Find in map** — type and the matches light up while everything else
  dims, opening whatever was collapsed on the way. Clearing it puts the
  shape straight back.
- **Focus** — treat the selected node as the root, with a breadcrumb back
  out. This is how you work on one lecture without the other nine on screen.
- **Section** — mark a node as a category. Sections get their own heading on
  the canvas and their own page in the PDF, so you choose where the splits
  fall instead of always getting one page per top-level branch.

**Scaffold** drops a standard shape under the selected node — Pathophysiology
/ Clinical features / Investigations / Management / Complications, and three
others. Most topics take the same shape and retyping those headings is what
stops a map getting made.

Sibling order is yours: **↑ / ↓** in the bar, or **Alt+↑ / Alt+↓**.

### Where a general note goes

A remark that's true of *all* the types of something is **not** a sibling of
those types. Filing it beside them is the mistake the tree makes easiest:
on screen it reads as one more type, and on paper it gets its own writing
lane exactly like a type does.

The test: **"is this a kind of the thing above it?"** Allergic asthma is a
kind of asthma. "All types involve reversible airflow obstruction" is not.

So select the heading and tap **Note**. It prints under that heading and
*above* its children, in grey, with no writing lane of its own — it reads as
a remark about the heading rather than as another branch. Nodes carrying one
show a small **≡** on the canvas.

Three shapes worth telling apart, because only the first is a note:

- **A property of the parent** — "all types share reversible obstruction".
  That's a note on the parent.
- **An axis every type answers differently** — "age of onset" feels general
  but each type has its own answer, so it's a child *under each type*, or
  honestly a table, which a tree is bad at.
- **A shared sub-topic with substance under it** — `Shared pathophysiology`
  with children of its own genuinely *is* a child; it earns its place
  because there's structure beneath it.

### Dragging a node somewhere else

Drag a node onto another to re-file it. **On a touchscreen, hold it first** —
about a third of a second — because the canvas pans in both directions and an
immediate drag would be indistinguishable from a swipe. With a mouse it just
drags.

Where you let go decides what happens, and the indicator tells you before you
commit:

- **Middle of the box** — becomes a child of it. A ring appears around the
  target.
- **Near its top or bottom edge** — becomes its sibling above or below. A
  line appears on that side.

Dropping a node inside itself is refused, so a branch can never be cut off
from the root. Nothing shows and nothing moves. Drag near the edge of the
canvas and it scrolls, so the destination doesn't have to be on screen when
you start. `Cmd/Ctrl+Z` undoes a move like anything else.

### If you delete something you didn't mean to

**Delete removes the node and everything under it.** That is what it has
always done, but now it says so first: deleting anything with children asks,
and tells you how many nodes are going.

Three ways back, in the order you'd reach for them:

- **Undo** — `Cmd/Ctrl+Z`, or the ↶ button. `Cmd/Ctrl+Shift+Z` redoes.
  Covers the current session.
- **History** (in the map's header) — restore points kept *on this device*,
  written before anything destructive and every few minutes while you work.
  This survives a reload, and it survives the cloud copy being overwritten,
  which is the case undo can't help with. Restoring is itself undoable.
- **Deleted, but recoverable** — a deleted map's history outlives it, so the
  Maps list offers it back. It's only gone for good once you tap Forget.

**Export** does two things. **Copy as markdown outline** turns the map into
text, so it can become the spine of a chart note or a set of cards without
retyping anything. **Save PDF** turns it into paper.

### Printing a map to annotate

The PDF is built for writing on, not for looking at — the point is to open
it in GoodNotes or Notability and fill the space with a pencil. On an iPad
the Save button opens the share sheet, so the file goes straight into the
notes app; everywhere else it downloads.

Three layouts, and the choice is really about how much you plan to write:

- **Overview** — the whole map on one page with wide margins. The shape at
  a glance. Good for a pre-read, or for a lecture you already know.
- **Roomy map** — the overview, then one page per unit with a ruled lane
  beside every node. You keep the structure *and* get real room. This is
  the default and the one to use during a lecture. Two or more units also
  get a contents page with page numbers.

**Split pages by** chooses what a unit is: **Sections** (the default),
**Top-level branches** (what maps did before sections existed), or
**Labels** (a page per label). The sheet tells you how many pages each
choice produces before you commit to it, and says so plainly if you pick
Sections on a map where nothing is marked yet.

**Writing pages** chooses how a unit is drawn. **Indented outline** is the
default and the one to use: full-width rows at full size, so nothing is ever
cut off however deep the branch goes. Hierarchy reads as indentation plus a
coloured rule down each level, which is easier to scan while someone is
talking. **Map** draws the branch as a tree beside the writing column, which
looks better but has to shrink to fit — at four levels deep that means about
a third size, and long labels get tight. The map picture is on page 1 either
way.

A node with no children never gets its own page — one lane on an empty
sheet is not worth the paper. It stays on the overview instead.
- **Worksheet** — no picture; every node becomes a heading over a block of
  ruled space. The most room per node. Use it when you're rebuilding a
  topic from scratch rather than annotating what you already mapped.

Short branches stretch to fill the page rather than leaving the bottom
blank, so a three-point branch gives you three deep lanes instead of three
shallow ones. Long ones carry on to a second page.

Long labels wrap rather than being cut off. Wrapping now breaks at hyphens
and slashes too, which matters more than it sounds: "Renin-angiotensin-
aldosterone" is a single 29-character token with no spaces, and a wrapper
that only breaks on spaces has nowhere to put it.

**Starred nodes get more room.** Tap **☆ High yield** on anything worth
writing a lot about; it prints with a marker in the margin and roughly
double the ruled lines.

**Every section page ends with a `Q:` line.** Write the question this
material answers while you are still in the room. Turning a heading into a
question is the cheapest thing that improves a first pass, because it makes
the next pass retrieval instead of re-reading.

### Printing just one branch

Focus on a node, then **Export**: it offers that branch by default, printed
as a document in its own right — its own overview, its own sections, its own
filename. The branch keeps the colour it has on screen, so the printout and
the canvas still agree. Tap **Whole map** if you wanted the lot after all.

**Paper** matters more than it sounds: *iPad 4:3* fills the screen in a
notes app with no letterboxing, while Letter and A4 are the right choice if
the sheet is going to a printer. **Writing guides** are ruled lines, a dot
grid (better if you draw diagrams in the margin), or blank.

### Just the map, to annotate on the iPad

Pick **Overview** and **Paper → Fit to map**. Instead of squeezing the map
onto a sheet, it makes the sheet as big as the map: one page, nothing
scaled down, every label on one line, and generous white space around each
node to write in. The sheet tells you the size before you commit.

This is the right shape for a tablet, where you pinch and pan around a large
page — a printer would have to tile it. It is also the only export where
nothing can be cut off by construction, because nothing is ever shrunk.

If the size comes out bigger than you want, collapse a level or two with the
depth buttons first; the export prints whatever is expanded.

Whatever is collapsed on screen stays collapsed in the PDF — what you see
is what you print.

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

## The Activate now menu

The strip at the top of Today is the rescue menu — the strategies you
forget you have, on the day you most need them. **Map a lecture** is one
of them now: one tap from Today into Maps, for building the tree before
a lecture or filling in details after one.

### Rearranging it

Tap **⇅ arrange** in the Activate now header. Same controls as Arrange
Today, because it is the same editor:

- **↑ ↓** move a strategy one place.
- **📌** sends it straight to the top — worth it when the thing you
  reach for most is sitting sixth.
- **Shown / Tucked** decides whether it is on the menu by default or
  behind "+ more strategies". Tucking is not hiding: one tap still
  reveals everything.
- **Reset menu** puts it back to how it shipped.

The arrangement syncs, so the order you settle on follows you to the
phone.

Two things worth knowing. **Surprise me** only picks from strategies
still on the menu, so tucking something does not stop it being offered
at random — tucked ones are still in the pool, because the whole point
of the die is to reach past your habits. And if you un-tuck everything,
the "+ more strategies" line disappears rather than offering to show you
nothing.

Worth doing once, early in a term: put the two or three you actually use
at the top and tuck the rest. A menu you scan past is a menu you stop
reading.

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

### When sync holds off

Your data lives in one file in the cloud, keyed by your secret key, and
every device overwrites that one file. So the app will not send anything
up until it has first managed to *read* what is already there.

In practice you never see this — the read takes a moment and then the
green "Syncing automatically" appears as usual. It matters on a bad
connection. If the read fails, the sync panel says so in amber:

> Couldn't read the cloud copy, so nothing is being sent up. Your edits
> are safe on this device.

That is deliberate, not a failure to recover from. Everything you type
still saves on the device you are using; it just waits before leaving.
The alternative — pushing anyway — is how a phone that couldn't reach
the network for ten seconds could replace a week of work with an empty
file.

Two buttons when it happens:

- **Try again** — retries the read. If it works, syncing resumes and
  whatever you typed in the meantime goes up straight away.
- **Push this device** — a deliberate overwrite: send what is on this
  device up, without having read what's there. Use it when you know this
  device holds the newest copy, typically after working offline. It
  replaces the cloud copy, so don't use it on the device you've been
  using *least*.

If you are ever unsure which device is newest, export before pressing
anything: the safest move is always to get a copy off the device first.

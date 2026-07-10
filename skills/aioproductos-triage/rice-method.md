# RICE, grounded in the spine

RICE = **(Reach × Impact × Confidence) ÷ Effort**. The point of doing it on
AIOProductOS is that three of the four factors come from *real data on the same
customer record* — not a planning-poker vibe. The fourth (Effort) doesn't, so it's
the one you flag.

Keep every Reach in the **same unit** across the 3 items, or the scores aren't
comparable. Pick one period (this quarter is typical) and one unit (accounts, or
users) and hold it.

## Reach — how many, this period
*"Accounts or users this will affect in the period."* Ground it:
- Accounts linked to the insight + its duplicates (`list_insights`, clustered).
- Users in the affected step/segment from analytics (`analyze_funnel` step
  population, `get_retention` cohort size, `analyze_paths`).
Use the concrete count. If a request comes from 3 named accounts, Reach = 3 accounts
— don't inflate it to "the whole base" without a number behind it.

## Impact — how much it moves the goal, per reached unit
RICE's fixed scale: **3 = massive · 2 = high · 1 = medium · 0.5 = low · 0.25 = minimal.**
Ground the choice:
- MRR at stake behind the affected accounts (`get_customer_360`, `analyze_nrr`).
  Revenue is on the same record as the signal — use it as the weight.
- Which active objective it moves (`list_objectives`). An item that moves a live KR
  earns a higher Impact than one that touches nothing the team is trying to move.

## Confidence — how sure, as a %
RICE's scale: **100% = high · 80% = medium · 50% = low** (go lower for a guess).
Ground it in evidence strength:
- Count of distinct accounts asking, and how recent.
- Quantitative (an analytics number you can quote) beats anecdotal (one quote).
- A churned-account post-mortem citing the thing → higher confidence than a single
  feature request.

## Effort — person-months (the honest weak point)
The spine does **not** know engineering effort. So:
1. **Ask the user.** Best source — they know their team.
2. If they can't, use a labeled t-shirt → months estimate and mark it `(assumed)`:
   **S = 0.5 · M = 1 · L = 2 · XL = 4.**
Never present Effort as if the spine measured it. It's the input a human owns.

## Score and present
`score = (reach * impact * confidence) / effort`. Higher = do sooner.

Show the full row — R, I, C, E, and the score — with the source links, so a human
(or the org's configured prioritization model) can override any input. RICE is the
default lens; if the org runs ICE, WSJF, or value/effort, swap the math but keep the
discipline: every factor traced to a spine number, Effort flagged, human confirms.

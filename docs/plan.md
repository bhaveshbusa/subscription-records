# Execution plan

Work is sequenced so **you can test a real ledger before any AI exists**.

```text
SUB-1  Scaffold app + auth
  → SUB-2  Schema + seed
    → SUB-3  Query API
      → SUB-4  Ledger list UI          ← first sign-off you can click
        → SUB-5  Ledger detail UI
          → SUB-6  Query polish (needs-attention, pagination)
            → GATE A (you)  View & query signed off
              → SUB-7  Manual create/edit
                → GATE B (you)  You can maintain inventory without AI
                  → SUB-8  Proposal engine (no LLM)
                    → SUB-9  Chat text/list extract
                      → GATE C (you)  Capture → ledger
                        → SUB-10+ Lifecycle, files, jobs
```

Devin must not start SUB-9 until Gate A is Done. Ideally Gate B too, so failures are “AI write” not “list is broken”.

## Epics

| Epic | Issues | You sign off when |
|---|---|---|
| **Foundation** | SUB-1, SUB-2 | App boots, you can log in on preview, seed exists |
| **Ledger (view/query)** | SUB-3–6 | Gate A |
| **Manual write** | SUB-7, SUB-8 | Gate B |
| **Capture (text)** | SUB-9, SUB-10 | Gate C |
| **Lifecycle** | SUB-11–14 | Charges, price change, cancel, reactivate behave as docs |
| **Multimodal** | SUB-15–17 | Screenshot + PDF + voice land in the same ledger |
| **Jobs** | SUB-18–19 | Lapse scan + reminder, no silent status overwrite |

## Sign-off gates (your only required checkpoints)

Detailed scripts: [testing-and-signoff.md](testing-and-signoff.md).

| Gate | After | You do |
|---|---|---|
| **A — View & query** | SUB-6 | Search, filter, open detail, API matches UI |
| **B — Manual inventory** | SUB-7 | Add incomplete stub, edit amount as confirmed, see it in list |
| **C — Propose not decide** | SUB-10 | Chat capture does not confirm money without you |
| **D — Lifecycle** | SUB-14 | Pay / price hike / cancel / resubscribe do not create duplicates |
| **E — Files** | SUB-17 | Screenshot path produces proposals you can reject |
| **F — Operate** | SUB-19 | Daily lapse asks; it does not auto-cancel |

You may spot-check every PR; you **must** run the gate checklists.

## Issue sizing

Each Linear issue is meant to be **one Devin session / one PR**. If Devin’s PR exceeds ~800 lines of product code without generated lockfiles, the issue was too big — split and re-queue.

## After F

Backlog only (not scheduled): email ingest, bank CSV verify, PWA share-target, iOS camera, encryption extras, multi-currency FX.

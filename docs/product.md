# Product

Personal subscription-recording assistant. Web-cloud. One account, many devices.

## Objective

Convert messy, multi-modal, incomplete input into trustworthy subscription records **over time**.

Design for ambiguity: “I subscribed to Notion” and a pasted list of twelve services are both valid captures.

## AI in three layers (later epics)

1. **Input interpretation** — OCR, speech-to-text, LLM extraction of subscription candidates + evidence.
2. **Record reasoning** — normalize providers, duplicates, infer cadence, field-level confidence, lifecycle classification (`charged`, `terms_changed`, `cancelled`, …).
3. **Conversational completion** — one useful follow-up, remember deferred answers, explain why a field is missing.

The AI proposes. The user is the final authority for **cost**, **billing schedule**, and **renewal dates**.

## Surfaces

| Route | Purpose | Ships in |
|---|---|---|
| `/ledger` | List, filter, search, summary | SUB-4 (required first UI) |
| `/ledger/[id]` | Detail: current terms, field status, timeline | SUB-5 |
| `/ledger/new` | Manual add (no AI) | SUB-7 |
| `/chat` | Capture + proposal cards | SUB-9+ |

## Success metrics (personal)

- Time from “new sub” to a visible ledger row (even incomplete)
- Questions asked per capture (target: ≤1 in that session)
- Share of spend that is `confirmed` vs `inferred`
- You would rather use this than Notes/a spreadsheet

## Out of scope until a later Linear epic

Bank sync, Gmail ingest, teams/orgs, public pricing crawl, mobile native apps, growth/onboarding experiments.

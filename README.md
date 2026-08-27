# Personal subscription recorder

A **web-cloud** assistant that turns messy input (chat, lists, screenshots, PDFs, voice) into a trustworthy personal subscription inventory.

Success is not growth. Success is whether **you** can maintain your own inventory with less effort than a spreadsheet, without the system silently inventing prices or dates.

Your role: **test and sign off**. Devin implements. GitHub holds code and PRs. Linear holds the work queue.

## Start here

| If you need | Open |
|---|---|
| How the three tools work together | [docs/coordination.md](docs/coordination.md) |
| Why ledger view/query is first | [docs/query-and-ledger.md](docs/query-and-ledger.md) |
| Phased plan and sign-off gates | [docs/plan.md](docs/plan.md) |
| Linear issues to create (copy-paste) | [docs/linear-issues.md](docs/linear-issues.md) |
| What you personally test | [docs/testing-and-signoff.md](docs/testing-and-signoff.md) |
| Rules for Devin (and any agent) | [AGENTS.md](AGENTS.md) |
| Product + AI layers | [docs/product.md](docs/product.md) |
| Cloud architecture | [docs/architecture.md](docs/architecture.md) |
| Data model | [docs/data-model.md](docs/data-model.md) |

## Non-negotiables

1. The AI **proposes**. It does not silently decide cost, billing cadence, or renewal dates.
2. A subscription with only a provider name is valid. Incomplete stubs are first-class.
3. Lifecycle is an **event log** (charges, price changes, cancels). The list you see is a projection.
4. Every query is scoped to the signed-in `user_id`.
5. **Ledger read/query ships before capture AI.** You cannot sign off on recording if you cannot see or search what was recorded.

## Status

Documentation and execution plan only. Application code starts at Linear issue **SUB-1** (see [docs/plan.md](docs/plan.md)).

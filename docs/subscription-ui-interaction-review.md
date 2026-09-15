# SUB-71 interaction review record

**Human decision: Integrated differences approved by Bhavesh on 14 September
2026.** Approved Compact Rows v2 is preserved. The separate
[interaction prototype](https://www.magicpatterns.com/c/c43nasqwufyxo1rqzizqci)
is a synthetic simulation, not a running production implementation.

## Version record

- Visual reference: `ef875056-8fdf-4e14-885e-9ab93cf5129f` (SUB-70 approved).
- Interaction editor: `c43nasqwufyxo1rqzizqci`.
- Interaction v1: `2806ba40-9788-4ef9-8b66-30b5642d093f` (tested at actual
  390 × 844 CSS pixels; document width 390, scroll width 390).
- Interaction v2: `8d0b8aad-ea26-453a-9bf9-f21f00357c10`. At actual 390px,
  document and scroll width again measured 390px. The revised proposal asks
  correction versus actual terms change, and blocks an actual change without
  a user-entered effective date. Field confirmation remains staged; saved £12
  is still shown. Draft detail says Draft details and no longer offers false
  saved-field editing; reminder consent has distinct copy and no field-confirm
  control. Empty pending panels are removed.
- Interaction v3: `c8716a72-b135-4323-8418-c234f20f61d1`. Cedar's collapsed
  row now previews its own open draft as **Proposed draft** with Premium and
  £8 monthly, while renewal says Missing. Internal record IDs were removed from
  visible copy; non-trial rows with no trial preference omit the irrelevant
  trial-end control. The preview changes to saved-row presentation on accept.
- Interaction v4: `883b8f20-419f-47d9-a3eb-a3369ff56d5c`, a
  deterministic copy refinement on v3. At actual 390 × 844 CSS pixels, document
  width and scroll width both measured 390. Cedar's incomplete acceptance kept
  renewal not recorded, amount/cadence proposed, and the plan saved as supplied;
  the success feedback names these distinctions.
- Interaction v5: `fff1361b-54a2-42c0-ba64-1426a42dd53b`. Saved
  and proposed primary terms now follow the identity header; direct Reminders
  and Conversation shortcuts remain at the top. At actual 390 × 844 CSS
  pixels, document and scroll width both measured 390. The DOM order showed
  Saved terms before Reminders, with the reminder shortcut still first in the
  quick links.
- Final interaction version: `2ef1d750-8e1d-4627-8d77-4279b089b24a` (v6).
  The identity header has an explicit correction action. At actual 390 × 844
  CSS pixels, document and scroll width both measured 390; at 1280px desktop,
  both measured 1280. Proposing Studio on
  Northstar Personal exposed the existing Studio holding and blocked review
  creation until **Same holding** or **Keep separate** was chosen. Creating a
  Keep separate review left the Personal saved identity unchanged and showed
  the Studio identity as pending on that row.
- Repository baseline: `c5fc699`.
- Synthetic fixture date: 14 September 2026; no real subscription evidence.

## Human review tasks

Reset the synthetic demo before a fresh run. Compare the two Review layout
options using the same subscription. Record confusion, missed actions and
unexpected changes; speed is secondary to correct understanding.

| Task | Expected result | Agent observation |
|---|---|---|
| Identify Northstar Personal vs Studio | Account visible before opening; identities remain separate | Pass: row shows Personal/alex@example.test and Studio/studio@example.test; opening one retains the account context. |
| Correct provider or account | Explicit target and review; never silently merge separate holdings | Pass in v6 for the synthetic Personal→Studio case: explicit choice required, saved identity unchanged while the review is pending. Production multi-match enumeration and transactional retarget remain implementation requirements. |
| Explain saved vs proposed Personal price | £12 saved; £15 proposed and not yet applied | Pass for distinction in both treatments. V2+ blocks a selected £15 change until it is classified as correction or actual terms change; actual change requires a user-entered effective date. Staging Confirm changes only proposal state and keeps saved £12 visible. |
| Confirm Studio amount only | Amount confirmed; cadence/date keep their previous trust | Pass: £24 changed from Inferred to Confirmed; monthly stayed Inferred and renewal stayed Confirmed. |
| Save only a note | Note updates; no term or trust changes | Pass: Studio note saved while amount Confirmed and cadence Inferred remained unchanged. |
| Accept incomplete Cedar draft | Added with missing renewal; no forced completion or inferred zero | Pass on published v4: collapsed draft previews Premium/£8 monthly as Proposed draft; after selecting supplied values and accepting, renewal stayed missing, amount/cadence proposed, plan saved as supplied. |
| Find and set a reminder | Direct Set/Edit; renewal/trial choices independent | Pass: Juniper renewal set to Enabled, 3 days; its missing date yielded no reminder date and trial choice remained Unset. |
| Later then resume Juniper question | Deferred question stays reachable and targets the right composer | Pass: Later showed Deferred — still available here; Answer focused Juniper composer. |
| Navigate away and return with unsent text | Target-specific draft, selected context and useful return focus preserved | Pass for typed text and target: Juniper's unsent invoice note remained on return from Northstar. Exact scroll/focus restoration remains to check. |
| Complete work under Pending reviews | Filter count changes, but the open row and all its content remain until closed | Pass on v5: Cedar's draft acceptance changed Pending reviews from 3 to 2 rows, while Cedar stayed expanded and visible as Active. |
| Simulate failure and retry | Input/staging retained; no false success or duplicate submission | Pass for notes: failed save retained the entered text, said nothing was saved, and retry completed. Staged-proposal failure remains to check. |
| Keyboard and 390px layout | Visible focus, reachable actions, no horizontal overflow | At measured 390px, document scroll width equalled viewport width. Close returned focus to Juniper's originating row; Tab moved to the next row with a visible 3px outline. Sample text color contrast calculated from CSS tokens was ≥6.9:1 on paper/white. Full keyboard journey, zoom/reflow and component-level accessibility audit remain for implementation. |

## Initial comparison and revision

Integrated differences kept Northstar's saved £12 and proposed £15 beside each
other in the saved amount context. The panel mode displayed the same values but
inserted another section before saved terms, and even showed an empty panel on
Studio. **Bhavesh selected Integrated differences** for the compact direction.
The proposal identity repeated the row and
header, and a long explanatory note increased mobile scrolling. V2 was requested
to remove these repetitions, label draft-only content correctly, give reminder
preferences consent wording, and require correction-versus-actual-change timing
for a proposal that replaces a known amount. These findings prevent v1 from being
approved as the interaction contract.

V2 resolved the blocking price-acceptance and draft-detail wording findings.
V3 addressed the collapsed Cedar row without presenting its proposal as a saved
fact. The published v4 wording no longer assigns the plan independent trust.
V5 restores primary terms ahead of the full reminder editor while keeping
direct mobile access to reminders.
The **interaction treatment is approved; implementation and final human task
sign-off remain separate**. The prototype
does not connect to production writers or demonstrate live conflict recovery;
those require the issue-specific implementation tests. Its identity demo has
one matching fixture and chooses that candidate for display; **production must
show every compatible holding and never silently pick the first**. The demo's
Same holding choice is only a local review marker, not an implemented retarget
or merge. The existing matching/retarget writer remains authoritative.

The agent's task checks are not human usability sign-off or a complete
accessibility audit. Production tests and responsive evidence belong in each
implementation PR as well as the final SUB-79 validation. The comparison task
sheet and human gate: [validation/sub-79-ui-signoff.md](validation/sub-79-ui-signoff.md).

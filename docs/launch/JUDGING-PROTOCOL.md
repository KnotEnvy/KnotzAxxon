# Independent panel and candidate proof

The unchanged seven lenses are in FINISH-LINE.md. The user requires each of Luna,
Terra and Haiku independently to score at least9 in every lens on the same frozen
candidate. There is no averaging, cherry-picking or substitution. Scores must be
honest; implementation work and external verification gaps are reported as such.

## Identity and proof packet

After runtime, cleanup and marketing integration, commit the runtime and QA harness,
then run `node scripts/qa/launch/freeze-candidate.cjs rc01` (use a new name each time).
The immutable candidate JSON pins the exact commit, all runtime/resource file hashes,
browser bot and live-harness hashes, dependency versions and marketing manifest.
The actual file count is measured on each candidate.
Do not alter runtime/assets or test laws during final counted trials. A subsequent
runtime fix creates a new candidate and needs applicable fresh evidence.

Attach the full regression/build/package results, production default+legacy model
and lifecycle/UI checks, actual nested-path Itch archive verification, source and ZIP
hashes, hardware renderer/browser/device/quality/viewport/frame counts, per-seed bot
records, live-agent viewed frames/notes, marketing exports/source manifest and audio
measurement/audition limits. Live Itch inspection and new portable package are distinct
from an account upload. User-reported prior human acceptance is labelled separately.

`campaign-report.cjs <candidate.json>` audits raw final bot receipts, rejecting pilots,
software, mismatched source/harness, invalid resources, duplicates and incomplete runs.
It reports counts by band/configuration, all-sector/boss/rack/gate/fence/space coverage,
earned-next-loop diagnostics, collisions/warnings, grades, heat/fuel/resource telemetry
and failed-seed repro data. Its readiness flag covers only the bot evidence. Physical
controllers/phones, subjective feel, listening and sustained FPS are separate claims.
The default accelerated rendered cadence is1/12; actual counts are recorded per seed.

## Fresh independent review rounds

Use a fresh readonly `delegate_task` for **each** judge in every round, including any
recheck. No implementation, helpers, cross-judge score sharing or thread-send reviews.
All judges receive the same frozen identity and complete proof packet. They inspect
the actual package and evidence independently and return all seven scores, concrete
reasons, evidence paths, confidence, limits and actionable findings. Do not request a
target score, force consensus or hide known limitations from the brief.

Save every original response verbatim with its SHA256, task/model identity and candidate
identity under `docs/launch/judging/round-NN/`. Transcribe its unchanged ratings into
`round.json`: schema `knotzaxxon.judge-round.v1`, candidate `{commit,sourceHash}`, and
three `judges` entries. Each has `judge` (`luna`, `terra`, `haiku`), exact requested
`model`, `responseFile`, `responseSHA256`, and seven `lenses` with numeric `id`1..7,
numeric `score`0..10, `reason`, `evidence` paths, `confidence`, `limits` and `findings`.
No response or earlier round is overwritten. The matrix of all individual scores plus
median/range by lens is reported without replacing the individual-score gate.

Run `judge-gate.cjs <candidate.json> <round.json>`. It fails even if twenty scores
are10 and the last is8.9; mixed candidates, missing/duplicated judges or lenses,
unsupported models and missing/changed original responses fail. Test fixtures in
`judge-gate.test.js` are synthetic integrity checks, never actual panel ratings.
This check does not publish, approve or establish any missing evidence by itself.

## Implementation after findings

Primary assigns precise findings, candidate/evidence, objections and acceptance
criteria to the existing correct owner, then integrates sequentially:

- Fable High:3D/assets/environment/lighting/ambient/background art.
- Opus High:UI/HUD/title/menu/typography/layout/compositing/promotional presentation.
- Spark1.3 on SuperBeast:audio/content and actual-measurement follow-up.
- Hydrogen High on SuperBeast:code cleanup/reliability, excluding other owners' leases.
- Primary:bot/QA/integration/package/distribution and coordination.

Mixed marketing findings are split between underlying world rendering (Fable) and
presentation (Opus). No accepted-art contest is reopened. Appropriate regressions,
hardware/playtest/marketing evidence follow each fix before the next frozen candidate
and fresh independent judging round. No final publication or completion claim occurs
below any required gate. If external account/device/listening constraints block a
substantiated score, name the exact constraint and continue independent work.

# ClearAllergy: transferable information-integrity patterns

Research date: 14 October 2026. Scope: a small restaurant allergen-information product. This is a source-backed design critique, not an implementation plan or a claim about ClearAllergy's current code. No repository was inspected or changed in this research. “Adopt”, “defer”, and “reject” below are recommendations inferred for this product, not claims that the cited organizations recommend ClearAllergy's particular design.

## Bottom line

The useful enterprise lesson is disciplined ownership of evidence and changes. A small app can apply that with a few explicit states, stable identifiers, revision-bound review, a published snapshot, and a reliable correction path. Buying a PIM, recreating SAP, adopting event sourcing, or distributing data like Meta would add mechanisms without establishing whether a restaurant's information is true.

The dangerous transfer is “serve the last known good version.” An old software configuration may be recoverable; an old allergen statement can become false the moment the kitchen changes supplier or recipe. ClearAllergy needs a way to withdraw or mark uncertain information before a replacement is ready. It must distinguish a planned future change, a correction of an already-wrong statement, and an emergency kitchen substitution.

## Six official examples and their limits

### 1. GS1: distinguish product identity, formulation changes, and physical traceability

**What the source establishes.** GS1's GTIN Management Standard §2.2 requires a new GTIN when a formulation/functionality change both affects legally required packaging information and is expected to be distinguishable by consumers or supply-chain partners. Its example explicitly includes adding nuts as a new allergen. This is not a rule that every edit or recipe change requires a new barcode. [GS1 GTIN Management Standard, release 1.1, September 2023, p. 11](https://ref.gs1.org/standards/gtin-management/1.1.0/)

The traceability standard distinguishes a product class from a batch/lot and an individual instance, with progressively greater cost and precision. A product identifier alone cannot identify which physical batch was used. [GS1 Global Traceability Standard, §§2.2 and 3.3](https://ref.gs1.org/standards/global-traceability/)

**Adopt now.** Distinguish a generic ingredient name, the specific supplier/brand product, its evidence-backed revision, and the recipe revision that used it. Keep source-document identity, source date, capture date, reviewer, and applicability. Preserve supplier SKU/GTIN when available; do not make a barcode a prerequisite for onboarding a restaurant. Record an effective date or applicability period when known rather than treating upload time as physical truth.

**Defer.** Automated GDSN exchange, full EPCIS event histories, and per-serving traceability until the restaurant's operational data actually supports them. Batch evidence may still be essential in a particular incident; deferral does not imply that product-level identity solves recalls.

**Reject.** A single generic “pesto” record as authoritative for every brand, or a GTIN lookup as proof of today's kitchen contents. Identifiers improve matching; they do not certify provenance or current use.

**Tradeoff.** Specific products and revisions create more records, but prevent silently applying one supplier's declaration to another supplier's product.

### 2. SAP MDG and Akeneo PIM: stage changes, show differences, bind approval to the proposed change

**What the sources establish.** SAP's material-change workflow copies active data to an inactive area, associates a material with one active change request, allows reasons and attachments, and activates it after steward approval and technical validation. [SAP, “Exploring the Functions of SAP Master Data Governance for Material”, Change Material](https://learning.sap.com/courses/sap-master-data-governance-on-sap-s-4hana/exploring-the-functions-of-sap-master-data-governance-for-material)

Akeneo's product drafts become proposals for approval. Editing a waiting proposal returns it to “In progress” and requires resubmission. Akeneo also permits partial approval. [Akeneo, Drafts &amp; Proposals](https://help.akeneo.com/v7-collaborative-work/v7-drafts-proposals)

**Adopt now.** A small, understandable lifecycle: draft, reviewed/approved, published, superseded or withdrawn. Show a before/after diff with the supporting label or specification. Identify the accountable restaurant reviewer. Approval applies to an exact revision and its dependencies, not to a mutable record forever. A relevant edit or dependency change invalidates that approval.

**Defer.** Multi-department workflows, organization-wide stewardship teams, elaborate policy engines, and ERP integration.

**Reject.** Copying partial approval mechanically. Ingredient selection and allergen declarations can be coupled: publishing one field while leaving the other unapproved may manufacture an internally inconsistent meal. For this small app, review the complete safety-relevant change together. Do not describe a solo operator's self-check as independent verification.

**Tradeoff.** A separate reviewer can catch mistakes but can delay corrections. Give authorized staff an immediate “information unavailable/under review” action; require review before restoring reassuring information. High-impact changes deserve more scrutiny than cosmetic menu text.

### 3. Contentful: the published state is distinct from the latest edit; concurrency needs an explicit contract

**What the sources establish.** Contentful distinguishes Draft, Changed, Published, and Archived. A changed entry still returns its last published content through the Delivery API, while pending edits are available through management/preview. [Contentful, Determine the state of entries and assets](https://www.contentful.com/developers/docs/tutorials/general/determine-entry-asset-state/)

Its management API rejects an update when the submitted version no longer matches the stored version. This is optimistic concurrency, rather than silently overwriting another editor. [Contentful, Updating and version locking](https://www.contentful.com/developers/docs/references/content-management-api/overview/)

Contentful also snapshots entries at publication, with comparison and restore capabilities. [Contentful, Versioning](https://www.contentful.com/help/faq/versioning/)

**Adopt now.** Diner-facing pages, filtered results, detail views, and exports should derive from the same explicitly published revision. A dish revision should identify the precise ingredient/product revisions reviewed with it. Reject stale edits and show a useful conflict, rather than last-write-wins. Protect the publish action against both an intervening edit and changed dependencies.

**Defer.** A standalone CMS, many content environments, or collaborative real-time editing.

**Reject.** “Published” as a permanent trust badge, or approval as a field that can survive arbitrary edits. Also reject a snapshot that stores only mutable links: its historical meaning changes when linked ingredients change.

**Tradeoff.** Snapshots make historical statements reproducible, but create deliberate work when an ingredient changes. That work is valuable only if the app identifies every affected dish and restaurant location. Restoring a historical snapshot must create a new accountable publication decision; it must not erase the correction history.

### 4. Google SRE: human interface, semantic validation, and ownership are reliability controls

**What the source establishes.** Google's configuration-design chapter connects usability with reliability, favors fewer unnecessary controls, distinguishes syntax from semantic validation, requires clear ownership and versioning, and distinguishes committing a change from applying it. Its rollout advice also includes rollback and gradual deployment. [Google SRE Workbook, Configuration Design and Best Practices](https://sre.google/workbook/configuration-design/)

**Adopt now.** Make dangerous omissions harder: explicit unknown states, visible source evidence, product identity checks, and a preview of the exact public result. Ask questions restaurant staff can answer, not database terminology. State what “reviewed” means and by whom. Check meaningful invariants, such as a published meal not referencing an unreviewed product revision, rather than just accepting valid JSON.

**Defer.** Configuration languages, generalized rule engines, or broad organization-level rollout platforms.

**Reject.** Blindly applying gradual rollout to an allergen correction. Software changes may be canaried; different diners should not intentionally receive contradictory known ingredient facts as an experiment. A correction needs rapid propagation or withdrawal. Likewise, an old recipe is not safe to restore merely because an old app build was safe.

**Tradeoff.** Fewer form fields reduce burden, but removing evidence or uncertainty questions can hide essential facts. Optimize the small number of questions that establish identity, applicability, and accountability.

### 5. Meta and Uber: saving is not distribution; version and observe what readers actually receive

**What the sources establish.** Meta documents how an old cache-fill response can arrive after a newer invalidation and restore stale content. Versions help order data, but its case study shows that subtle races and error handling can still leave a cache wrong; it uses end-to-end consistency measurement and tracing. [Meta Engineering, Cache made consistent, June 2022](https://engineering.fb.com/2022/06/08/core-infra/cache-made-consistent/)

Uber separates configuration storage, generation, distribution, rollout, and clients, and discusses propagation latency as an operational contract. [Uber Engineering, How We Unified Configuration Distribution Across Systems at Uber, March 2023](https://www.uber.com/us/en/blog/how-we-unified-configuration-distribution-across-systems-at-uber/)

**Adopt now.** List every public read path, including CDN, browser state, search/filter results, generated PDFs, and offline copies if present. Expose a publication revision and verify that a real public read returns it after publication. Reuse one published representation; avoid independently computed allergen summaries that drift. Give a failed propagation check a visible status and a responsible person.

**Defer.** Distributed pub/sub, cache-consistency services, cross-region replication, and fleet rollout machinery unless demonstrated load requires them. A small app may do better with fewer cache layers.

**Reject.** “The save returned success, so everyone has the correction,” or a purge call treated as proof of reader state. Short TTL is only a staleness bound under the relevant assumptions, not instantaneous consistency.

**Tradeoff.** Fresh authoritative reads cost latency and availability. Cached/offline reads improve availability but can be stale. Immutable versioned payloads reduce mixing; the pointer to the current or withdrawn state still needs freshness. No central update can retract a screenshot, printed menu, or disconnected device. Design the staff fallback and offline wording around that limit.

### 6. GitHub: lightweight ownership and revision-aware review for the code and documentation

**What the sources establish.** CODEOWNERS routes review requests to responsible people; requiring their approval is a separately configured control. GitHub branch protection can dismiss approvals after the reviewed diff changes, and can require status checks. [GitHub, About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners), [GitHub, About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

**Adopt now.** One short repository entry point explaining the product, source-of-truth boundaries, local checks, and links to a small domain glossary, publishing/correction policy, decision log, and test scenarios. Keep each fact in one canonical place; link rather than clone context into many agent instruction files. Use focused ownership/review for allergen derivation, publication, authorization, and schema changes where another qualified reviewer exists.

**Defer.** A sprawling documentation hierarchy, multiple role-specific copies of the same context, or complicated merge governance for a one-person project.

**Reject.** Treating CODEOWNERS, a green build, a code review, or a well-written agent prompt as certification of food facts. Restaurant evidence and operational review remain separate responsibilities.

**Tradeoff.** Tiny docs can omit important invariants; large docs drift. Keep the canonical rules short and connect each high-risk rule to a test and an accountable owner. This recommendation does not prescribe moving files or introducing new tooling without seeing the current repository.

## Recommended minimum information contract

The following is a ClearAllergy-specific synthesis, not a vendor's reference architecture.

1. **Authority is per fact.** The supplier's current label/specification supports a purchased product's declaration. Restaurant staff establish which product is actually used, the recipe, substitutions, location, and preparation practices. Software validates and derives from these assertions. No single organization is automatically authoritative for every layer.
2. **Keep statements separate.** Record ingredients/declarations, precautionary warnings, and kitchen cross-contact assessment distinctly. Missing information is unknown, not an empty allergen set. No allergen found in a text extraction is not evidence of absence. A supplier's “may contain” statement should not silently become either “contains” or “safe.”
3. **Preserve evidence.** Keep a stable reference to the actual evidence reviewed, not only a URL whose contents can change. A readable photo or supplier document plus its relevant product/version identification is more useful than an unsupported “verified” flag. Record source capture and review separately.
4. **Pin the reviewed meaning.** A meal publication references its recipe and ingredient revisions plus the derivation/rule version needed to explain the displayed result. Otherwise an ingredient edit can silently rewrite both the public answer and its historical audit trail.
5. **Separate publication from applicability.** Knowing that a future replacement exists must not imply the restaurant already uses it. Conversely, if the current statement is known to be wrong, retaining it while a draft waits for approval is unacceptable. Hold or withdraw the affected reassurance and give staff an actionable fallback.
6. **Keep a modest audit trail.** Record actor, time, old/new revision, reason, evidence, review decision, public activation, and withdrawal/correction. Use normal database controls and tested backups before considering tamper-evident infrastructure. Ordinary application audit history should not be marketed as immutable forensic proof.
7. **Make correction a first-class operation.** Find affected dishes and locations, remove invalid reassurance, update the complete approved snapshot, verify the public result, and retain what changed. Define the treatment of already-printed/offline material and staff communication in the restaurant's operational process.
8. **Do not ask AI to close the trust gap.** OCR or a model can propose structured fields and highlight uncertainties. Critical fields and product matching need evidence-based review. Review must cover the actual proposed values, not just a confidence score or a generic “AI checked” status.

## Failure scenarios worth reviewing before adding architecture

- Two staff members edit the same product; one removes an allergen from an older version. Does the second save fail visibly?
- A manager reviews recipe R7; an ingredient changes before publication. Does publication require review of the changed meaning?
- A label photo is from brand A but the kitchen receives brand B. Can the app identify the mismatch instead of matching only the generic name?
- A supplier corrects a previously incorrect label. Can every affected public dish be found and held promptly?
- A kitchen switches product before staff finish the new record. What do diners see during that gap?
- A diner has an old menu open. After a correction, can the app detect stale publication state when connected, and does it avoid claiming currentness when disconnected?
- All individual records are valid, but a public page mixes recipe and ingredient revisions. Is that prohibited?
- An operator restores an old version. Does it restore an obsolete assurance, or require checking today's applicability?
- An admin change is recorded but public delivery fails. Is it visible as pending/failed publication rather than “done”?

These are review criteria, not findings about existing defects.

## Safety boundary

The Food Standards Agency's current guidance for England, Northern Ireland, and Wales calls for up-to-date ingredient/recipe records and separate management of cross-contamination. It recommends written allergen information supported by conversation for non-prepacked foods, and explains that free-from claims require strict ingredient, handling, and preparation controls. [FSA allergen guidance, updated 17 July 2026, §§2.5–2.6 and 4.1–4.2](https://www.gov.uk/government/publications/allergen-guidance-for-food-businesses/allergen-guidance-for-food-businesses)

Consequently, none of the information-governance patterns above can establish that a particular meal is medically safe for a particular diner. A perfectly versioned record can be wrong, a correct recipe can be substituted, and a correct ingredient list can coexist with kitchen cross-contact. ClearAllergy should communicate supported information and uncertainty, avoid turning “not listed” into “allergen-free”, and support staff confirmation and withdrawal. A disclaimer cannot compensate for an interface that strongly implies guaranteed safety. Jurisdiction and claim wording require their own qualified review; the FSA example is not a universal legal checklist.

## Priority recommendation

**Now:** determine exact source/owner boundaries, explicit unknown and withdrawn states, product/recipe revision identity, revision-bound review, stale-write protection, one coherent published view, and a demonstrable correction path.

**Next, when evidence justifies it:** automation for supplier updates, batch-level information, targeted second-person review, propagation monitoring, and more sophisticated audit controls.

**Avoid for now:** enterprise PIM/MDM procurement, microservice/event-sourcing architecture, generalized rules or workflow engines, distributed cache infrastructure, and elaborate agent-context structures. Reconsider only against a specific failure mode, workload, or operating requirement that the smaller approach cannot meet.

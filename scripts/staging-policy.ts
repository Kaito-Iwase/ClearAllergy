import { z } from "zod";

const sha = z.string().regex(/^[0-9a-f]{40}$/);
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const team = z.string().regex(/^team_[A-Za-z0-9]+$/);
const project = z.string().regex(/^prj_[A-Za-z0-9]+$/);
const origin = z.string().refine((value) => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.origin === value && !url.username && !url.password;
    } catch { return false; }
});
const repository = z.strictObject({ id, fullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/) });

// Local policy must be reviewed independently of the candidate commit and event payload.
export const stagingPolicySchema = z.strictObject({
    version: z.literal(1),
    repository,
    branch: z.literal("test/staging"),
    workflowId: id,
    workflowPath: z.literal(".github/workflows/ci.yml"),
    workflowFileSha: sha, // Git blob SHA of the reviewed CI definition, not a commit SHA.
    githubEnvironment: z.literal("staging"),
    teamId: team,
    stagingProjectId: project,
    productionProjectId: project,
    stagingUrl: origin,
    productionUrls: z.array(origin).min(1),
});

const run = z.strictObject({
    id, attempt: id, repository, headRepository: repository,
    workflowId: id, workflowPath: z.string(), workflowFileSha: sha,
    event: z.string(), status: z.string(), conclusion: z.string().nullable(),
    headBranch: z.string(), headSha: sha,
});

// This is normalized evidence, NOT an authenticated GitHub/Vercel API response.
// A future read-only collector must obtain each field from its authoritative API.
export const stagingEvidenceSchema = z.strictObject({
    run,
    latestRun: z.strictObject({ id, attempt: id, repository, workflowId: id, headBranch: z.string(), headSha: sha }),
    currentHeadSha: sha,
    candidateSha: sha,
    checkedOutSha: sha,
    githubEnvironment: z.strictObject({ name: z.string(), branch: z.string(), protectionVerified: z.boolean() }),
    target: z.strictObject({
        teamId: team, projectId: project, environment: z.string(),
        url: origin, aliases: z.array(origin),
    }),
    alias: z.strictObject({
        teamId: team, projectId: project, url: origin,
        deploymentId: z.string().min(1), redirect: z.string().nullable(),
    }),
    aliasDestination: z.strictObject({
        id: z.string().min(1), teamId: team, projectId: project,
        environment: z.string(), branch: z.string(), state: z.string(),
    }),
});

export type StagingPolicy = z.infer<typeof stagingPolicySchema>;
export type StagingEvidence = z.infer<typeof stagingEvidenceSchema>;

/** Simulation only. Even an eligible result never authorizes a deployment. */
export function evaluateStagingPolicy(policyInput: unknown, evidenceInput: unknown) {
    const result = (reasons: string[]) => ({
        mode: "dry-run" as const,
        eligible: reasons.length === 0,
        deploymentAllowed: false as const,
        reasons,
    });
    const policyResult = stagingPolicySchema.safeParse(policyInput);
    if (!policyResult.success) return result(["INVALID_POLICY"]);
    const evidenceResult = stagingEvidenceSchema.safeParse(evidenceInput);
    if (!evidenceResult.success) return result(["INVALID_EVIDENCE"]);
    const p = policyResult.data;
    const e = evidenceResult.data;
    const reasons: string[] = [];
    const require = (condition: boolean, reason: string) => { if (!condition) reasons.push(reason); };
    const sameRepo = (r: StagingPolicy["repository"]) => r.id === p.repository.id && r.fullName === p.repository.fullName;

    require(sameRepo(e.run.repository) && sameRepo(e.run.headRepository) && sameRepo(e.latestRun.repository), "UNTRUSTED_REPOSITORY");
    require(e.run.event === "push", "UNTRUSTED_EVENT");
    require(e.run.status === "completed" && e.run.conclusion === "success", "CI_NOT_SUCCESSFUL");
    require(e.run.workflowId === p.workflowId && e.latestRun.workflowId === p.workflowId
        && e.run.workflowPath === p.workflowPath && e.run.workflowFileSha === p.workflowFileSha, "WORKFLOW_MISMATCH");
    require(e.run.headBranch === p.branch && e.latestRun.headBranch === p.branch, "BRANCH_MISMATCH");
    require([e.currentHeadSha, e.candidateSha, e.checkedOutSha, e.latestRun.headSha].every((s) => s === e.run.headSha), "COMMIT_MISMATCH");
    require(e.latestRun.id === e.run.id && e.latestRun.attempt === e.run.attempt, "SUPERSEDED_RUN");
    require(e.githubEnvironment.name === p.githubEnvironment && e.githubEnvironment.branch === p.branch
        && e.githubEnvironment.protectionVerified, "ENVIRONMENT_NOT_VERIFIED");
    require(p.stagingProjectId !== p.productionProjectId, "PRODUCTION_PROJECT_COLLISION");
    require(!p.productionUrls.includes(p.stagingUrl), "PRODUCTION_URL_COLLISION");
    require(e.target.projectId === p.stagingProjectId && e.target.teamId === p.teamId, "TARGET_MISMATCH");
    require(e.target.environment === "preview", "TARGET_NOT_PREVIEW");
    require(e.target.url === p.stagingUrl && e.target.aliases.length === 1
        && e.target.aliases[0] === p.stagingUrl, "UNEXPECTED_URL_OR_ALIAS");
    require(e.alias.url === p.stagingUrl && e.alias.projectId === p.stagingProjectId
        && e.alias.teamId === p.teamId && e.alias.redirect === null, "ALIAS_MISMATCH");
    require(e.alias.deploymentId === e.aliasDestination.id && e.aliasDestination.projectId === p.stagingProjectId
        && e.aliasDestination.teamId === p.teamId && e.aliasDestination.environment === "preview"
        && e.aliasDestination.branch === p.branch && e.aliasDestination.state === "READY", "ALIAS_DESTINATION_MISMATCH");
    return result(reasons);
}

// Presentation only: never grants authority or changes the harness verdict.
const line = (value) => String(value ?? "未確認")
    .replace(/\s+/gu, " ")
    .split("").filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && !(code >= 127 && code <= 159)
            && !(code >= 0x202a && code <= 0x202e) && !(code >= 0x2066 && code <= 0x2069);
    }).join("").trim();

const reasons = new Map([
    ["human decision or body blocker", "人の判断または本文のブロッカーが未解決"],
    ["human decision or blocker unresolved", "人の判断またはブロッカーが未解決"],
    ["blocking label", "保留対象のラベルあり"],
    ["not labelled agent-ready", "着手候補のラベルなし"],
    ["missing trusted assessment comment", "信頼できる評価記録なし"],
    ["assessment no longer matches definition/base", "評価が現在のIssue・比較元と不一致"],
    ["assessment expired", "評価の有効期限切れ"],
    ["missing priority/risk", "優先度・リスクが未確認"],
    ["incomplete definition/verification", "要件・検証計画が不足"],
    ["implementation authority is unresolved", "実装の許可範囲が未確認"],
    ["environment or blocker unresolved", "環境またはブロッカーが未解決"],
    ["dependency open or unknown", "依存Issueが未完了または未確認"],
    ["assigned to another owner", "別の担当者が作業中"],
    ["invalid scope path", "変更範囲のパスが不正"],
    ["PR ownership/scope unknown", "PRの担当・変更範囲が未確認"],
    ["issue is already closed", "Issueは既にCLOSED（完了理由は別途確認）"],
    ["sub-issue or dependency unresolved", "子Issueまたは依存Issueが未解決"],
    ["linked PR still open", "関連PRがまだOPEN"],
    ["missing trusted completion plan for the current issue", "現在のIssueに対応する完了計画を確認できず、残り条件も未判定"],
    ["conflicting observations for the same CI run", "同じCI実行の証拠が不一致"],
    ["conflicting observations for the same deployment", "同じ配備の証拠が不一致"],
    ["one or more acceptance criteria lack passing evidence for the required PR and environment", "必要なPR・環境で受け入れ条件の成功証拠が不足"],
]);

function describeReason(value) {
    if (reasons.has(value)) return reasons.get(value);
    return line(value)
        .replace(/^assessment state (.*)$/, "評価の状態が着手可能ではない: $1")
        .replace(/^existing PR #([0-9]+)$/, "既存PR #$1 あり")
        .replace(/^scope overlaps PR #([0-9]+)$/, "PR #$1 と変更範囲が重複")
        .replace(/^active scope #([0-9]+)$/, "作業中のIssue #$1 と変更範囲が重複")
        .replace(/^PR #([0-9]+) does not match the reviewed merge$/, "PR #$1 がレビュー済みのマージと不一致")
        .replace(/^PR #([0-9]+) lacks successful CI for its merge commit$/, "PR #$1 のマージ後CIの成功証拠なし")
        .replace(/^PR #([0-9]+) lacks current deployment and verification for (.*)$/, "PR #$1 の $2 配備・動作確認が不足")
        .replace(/^conflicting active deployments for (.*)$/, "$1 の現行配備が一意に定まらない");
}

/**
 * Human-readable view of an already evaluated result. JSON remains the evidence.
 * @param {{ snapshotPath?: string, reportPath?: string, plannedCommands?: string[] }} [options]
 */
export function formatHarnessSummary(command, result, options = {}) {
    const { snapshotPath = "", reportPath = "", plannedCommands = [] } = options;
    const lines = [];
    if (command === "queue") {
        const selected = result.issues.find((issue) => issue.number === result.selected);
        const ready = result.issues.filter((issue) => issue.ready).length;
        const title = selected ? line(selected.title) : "";
        lines.push(selected ? `結果: 着手候補 #${selected.number} ${title.length > 100 ? `${title.slice(0, 100)}…` : title}` : "結果: 着手候補なし（作業全体の完了ではありません）");
        lines.push(`内訳: 着手候補 ${ready}件 / 保留 ${result.issues.length - ready}件`);
        if (selected?.risk === "high") lines.push("注意: 候補は重要な領域を含む変更。独立レビューが必要です。");
        if (!selected) {
            const grouped = new Map();
            for (const issue of result.issues) {
                for (const reason of new Set(issue.reasons.map(describeReason))) grouped.set(reason, (grouped.get(reason) ?? 0) + 1);
            }
            for (const [reason, count] of grouped) lines.push(`保留: ${reason}（${count}件のIssue）`);
        }
        lines.push(selected ? "次: エージェントが候補のIssue・依存・PRを再取得し、着手条件を照合します。" : "次: エージェントが保留理由を照合し、改善探索は1回まで。候補がなければ停止します。");
        lines.push("範囲: 候補の提示のみ（このコマンドによる状態変更なし）");
    } else if (command === "completion") {
        const closed = result.blockers.includes("issue is already closed");
        lines.push(closed ? `結果: Issue #${result.number} は既にCLOSED（今回のclose操作なし）`
            : result.readyToClose ? `結果: Issue #${result.number} は完了処理の候補（close未実行）`
                : `結果: Issue #${result.number} の完了判定を保留`);
        if (result.blockers.length) lines.push(`確認: 検出した保留理由 ${result.blockers.length}件（未達条件の総数ではありません）`);
        // Never truncate blockers: re-evaluating the input after 15 minutes fails closed.
        for (const reason of result.blockers) lines.push(`保留: ${describeReason(reason)}`);
        lines.push(closed ? "次: エージェントが既存の完了記録と理由を確認します。再オープンはしません。"
            : result.readyToClose ? "次: エージェントがlive証拠を再確認し、既存の許可範囲で完了記録・close・再取得を行います。"
                : "次: エージェントが保留理由を原典と照合します。確認が揃うまでcloseしません。");
    } else if (command === "verify") {
        lines.push(`結果: ローカル検証 ${line(result.status)}（本番の確認結果ではありません）`);
        const passed = result.commands.filter((item) => item.status === "PASS").length;
        lines.push(`確認: ${result.commands.length}/${plannedCommands.length}工程を実行、${passed}工程が成功`);
        const test = result.commands.find((item) => item.name === "test");
        if (test) lines.push(`テスト: ${line(test.counts?.tests)}件 / 成功 ${line(test.counts?.pass)} / 失敗 ${line(test.counts?.fail)} / skip ${line(test.counts?.skipped)} / 中断 ${line(test.counts?.cancelled)} / todo ${line(test.counts?.todo)}`);
        for (const item of result.commands.filter((item) => item.status !== "PASS")) lines.push(`失敗: ${line(item.name)}（exit ${line(item.exitCode)}）`);
        const unrun = plannedCommands.filter((name) => !result.commands.some((item) => item.name === name));
        if (unrun.length) lines.push(`未実施: ${unrun.map(line).join("、")}`);
        if (result.diffCheck !== "PASS") lines.push("失敗: 差分検査（git diff --check）が未成功");
        if (result.candidateUnchanged !== true) lines.push("失敗: 検証中のファイル・HEADの同一性を確認できません");
        if (result.publicationSafe !== true) lines.push("失敗: 保存先の整合性を確認できません。この保存パスは証拠として使用不可です");
        if (result.runtime?.matches !== true) lines.push(`注意: Nodeの版が指定と不一致または未確認（実行 ${line(result.runtime?.actualNode)} / 指定 ${line(result.runtime?.expectedNode)}）`);
        lines.push("範囲外: 実DB・ブラウザ・実Clerk/Blob・GitHub CI・配備・利用者の理解");
        lines.push(result.status === "PASS" ? "次: エージェントが依頼に必要な独立レビュー・残る検証を確認します。"
            : "次: エージェントが失敗原因を調べ、安全な保存先と新しいファイル名で再検証します。");
        if (result.publicationSafe === true) lines.push(`詳細: ${line(reportPath)}（実コマンド・環境・対象・結果のJSON）`);
        return lines.join("\n");
    } else {
        throw new Error("Unknown summary command.");
    }
    lines.push(`対象: ${line(result.fetchedAt)} 取得のsnapshot`);
    lines.push(`詳細: ${line(snapshotPath)} / --format json で全情報（再評価は取得後15分以内）`);
    return lines.join("\n");
}

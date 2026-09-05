// 確認は入力ミスを防ぐUIの手順。DBの状態やAPIの公開条件は変更しない。
export function getMenuReviewMessage(args: {
    name: string;
    willPublish: boolean;
    ingredientsChanged: boolean;
}) {
    if (!args.willPublish && !args.ingredientsChanged) return null;
    const reason = args.ingredientsChanged
        ? "原材料を変更しています。アレルゲン全品目と注意書きを見直してください。"
        : "公開する前に、原材料・アレルゲン全品目・注意書きを見直してください。";
    return `「${args.name.trim()}」\n${reason}\n\n${args.willPublish ? "公開する設定で" : "非公開のまま"}保存します。入力内容を確認しましたか？`;
}

function formatUnknownAllergenSummary(names: string[]) {
    const visibleNames = names.slice(0, 8).join("・");
    const remainingCount = Math.max(names.length - 8, 0);
    return remainingCount > 0
        ? `${visibleNames} ほか${remainingCount}件`
        : visibleNames;
}

export default function MenuPublishReadinessNotice({
    unknownAllergenNames,
}: {
    unknownAllergenNames: string[];
}) {
    if (unknownAllergenNames.length === 0) {
        return null;
    }

    return (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-bold">
                公開にはアレルゲン29品目すべての確定が必要です。未設定:
                {unknownAllergenNames.length}件
            </p>
            <p className="mt-1 text-xs leading-5">
                {formatUnknownAllergenSummary(unknownAllergenNames)}
            </p>
        </div>
    );
}

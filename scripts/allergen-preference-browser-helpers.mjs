export function preferenceItem(scope, name) {
    return scope.getByRole("button", { name, exact: true })
        .and(scope.locator("[data-preference-mode]")).filter({ visible: true });
}

export async function setPreferenceMode(scope, names, mode) {
    for (const name of Array.isArray(names) ? names : [names]) {
        await preferenceItem(scope, name).click();
    }
    const label = { highlight: "注目にする", exclude: "一覧から除外", none: "設定を外す" }[mode];
    await scope.getByRole("button", { name: label, exact: true }).filter({ visible: true }).click();
}

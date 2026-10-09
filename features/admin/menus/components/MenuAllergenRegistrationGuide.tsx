export default function MenuAllergenRegistrationGuide() {
    return (
        <div role="group" aria-label="アレルゲン状態の入力ガイド" className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
            <h3 className="font-bold text-gray-900">状態を選ぶときの確認ポイント</h3>
            <dl className="mt-2 space-y-2">
                <div><dt className="font-bold">含む</dt><dd>料理の原材料に使用している品目を選びます。調味料や仕入れ品の原材料も確認してください。</dd></div>
                <div><dt className="font-bold">含む可能性あり・要確認</dt><dd>仕入れ品の工場・製造ラインの注意情報や、店舗の共用器具・揚げ油などによる混入の懸念が把握されている場合に選びます。</dd></div>
                <div><dt className="font-bold">原材料に含まない登録</dt><dd>料理の原材料に使用していないという登録です。厨房での交差接触まで確認済みという意味ではありません。</dd></div>
                <div><dt className="font-bold">未設定</dt><dd>資料や確認が不足していて判断できない場合は、未設定のまま確認してください。</dd></div>
            </dl>
            <p className="mt-3">「含む可能性あり・要確認」の理由は注意書きに記載してください。工場と製造ラインを区別し、仕入先の注意表示は元の内容が分かる形で残してください。</p>
            <p className="mt-2">他の公開メニューの「含む」登録は自動で補足されますが、工場・厨房の混入を検知する機能ではありません。注意書きへの入力だけでは各品目の状態は変わりません。</p>
        </div>
    );
}

# Provenance, review and information age

R08/R11/X01/X02。現在の `MenuItem.updatedAt` はprice/image等でも変わる。原材料label・supplier・recipeに基づく最終確認日時ではない。公開UIは「更新」と表示しており“最終食品確認”と書いているとは報告しない。

必要性がある候補: どのmenu revisionを、誰が、いつ、どの根拠種別で見直したか。根拠の全文保存はprivacy/営業秘密/保持費用があり、最小metadataから始める。正しいscopeはHD-03。

原材料が変わったときの選択肢:
- A 現行確認dialogを維持（prototype限定）。実確認の証跡/公開後変更の保証はしない。
- B revisionにreview metadataを結び、原材料変更後は再確認まで非公開。安全側だが作業量/形式的確認増加。
- C 変更内容と未再確認を公開面に表示。公開条件の意味が変わり、医療/UX/専門家の確認が必要。

Bを条件付き候補にするがAIが選択しない。料理が変わってもアプリへ入力しないケースは全案で残る。一定日数で自動失効する案は事業workflowと許容欠測の根拠がないためOPEN。根拠不足を“30日”などで埋めない。

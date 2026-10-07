# Literature search record

[Evidence register](../03-evidence-register.md)。全検索日2026-09-28。toolはWeb search（backend engine名は非公開）とContext7。PubMed/出版社/大学/行政のページをWebから開いた。PubMed native structured database searchやScopusを実行したとは主張しない。

採用: RQに直接関係する行政一次資料、規格団体、査読研究、公式技術資料。日本を優先し、海外はcontext差を明示。近年資料だけに限定せず反証に必要な旧研究を含める。除外: SEO/blogのみの重大claim、体験談、広告、食物アレルギー以外の無関係研究、提案段階を現行制度とする資料、版違いの技術syntax。全検索結果の件数を完全保存していないためPRISMA flow件数は作らない。選択したsourceの追跡可能性を優先したstructured reviewである。

| Search | Actual query / retrieval | Included | Excluded / limitation |
| --- | --- | --- | --- |
| S01 | site.caa.go.jp 外食 食物アレルギー 情報提供 消費者庁 2026 カシューナッツ | CAA allergy/efforts入口 | 包装食品と外食の法的適用を混ぜない |
| S02 | restaurant food allergy communication systematic review consumers staff risk | X03/X04/X05候補 | Reddit/Wikipedia/LLM食事研究は除外 |
| S03 | site.owasp.org ASVS 5.0.0 release authorization business logic | X08公式 | ASVS4以前の番号を5へ転記しない |
| S04 | site.nist.gov SP 800-218 SSDF 1.1 secure software development | X09 | 1.1 finalを版固定。「最新規格」とは主張しない |
| S05 | site.psas.scripts.mit.edu STPA handbook 2018 | X10 MIT overview | 完全STPA実施の根拠にはしない |
| S06 | site.w3.org WCAG 2.2 use of color status messages | X07 W3C | 解説blog除外 |
| S07 | "Knowledge, attitude, and practices" "2024" "studies" food allergy | X04 PubMed | 無関係な鼻炎/免疫療法研究除外 |
| S08 | site.iso.org standard 78176 25010 2023 | X11 ISO abstract | 有料全文未取得 |
| S09 | site.pnas.org communicating uncertainty numerical facts van der Bles 2020 5780 | X06 PNAS本文 | nutrition recommendationへ外挿しない |
| S10 | site.food.gov.uk non prepacked allergen written information conversation best practice 2025 | X02 GOV.UK本文 | consultationをfinal guidanceと区別 |
| S11 | site.caa.go.jp "外食" "義務" "正確" アレルギー | X01 2026 report | 2004 Q&A案/2014中間案で現行法断定しない |
| S12 | site.caa.go.jp "カシューナッツ" "令和8年4月" | X16 2026-06会見 | 2025意見募集は最終法令でない |
| S13 | site.caa.go.jp "ピスタチオ" "特定原材料に準ずる" | X16 | 候補時点の2023資料で現在を決めない |

## Retrieval log / screening decisions

X01: CAA 82頁PDFのmethod（PDF8–10頁）と提供情報課題（PDF47–48頁）をテキスト確認。全文の定量再解析・全図の視覚検証は未実施。Web findに日本語が一致しない場合があり、抽出されたpage textで確認した。団体数を患者数と読み替えない。

CAA事業者パンフレット令和8年7月は公式入口から取得できたがtext extractionが0行。スクリーンショット要求の応答で本文を読める画像を得られなかったため詳細の証拠には採用せず、読めたX01に切り替えた。

X03: PMCはbrowser challenge、PLOS本文に切替。X04: PMC challenge、PubMed abstractに限定。出版社・大学PDFリンクの一部403/取得失敗あり。X05はBathのabstract/metadataのみで国や詳細測定を補わない。X06はPNAS本文のmethod/limitationsを確認。X02は最初の推定FSA URLが取得失敗、検索で見つけたGOV.UK本文に切替。

| Source | Year | Population / region | Design / N | Main finding used | Limitation / applicability |
| --- | --- | --- | --- | --- | --- |
| X01 | 2026 | 日本、患者・保護者団体代表 | web survey有効38/回答43、選定interview10団体、2025-09～2026-01 | 更新時点・範囲・表示方法の課題 | self-selection/代理報告。日本のRQとして有用、CA効果なし |
| X02 | 2025 | UK food businesses/consumers | guidance、N非該当 | 情報+会話、原材料変更 | 日本の法解釈/具体TTLを導かない |
| X03 | 2018 | staff、多国、US/UK中心 | systematic review/meta-regression、38 studies | 知識/実践の異質性 | 主に横断/自己申告、因果・CAへの効果不明 |
| X04 | 2024 | staff、US/Europe中心 | systematic review/meta-analysis、23 studies | 態度だけで実践保証不可 | abstract限定、X03との重複を独立証拠として加算しない |
| X05 | 2020 | severe allergy consumers、取得abstractに国明記なし | 3一次研究の質的二次分析、39人 | nuisance/fussyと思われる懸念 | qualitative、頻度/日本への一般化不可 |
| X06 | 2020 | UK adults/BBC audience | 5 experiments、5780人 | uncertaintyの信頼影響は一様でない | news数値、verbal vs numeric差、食事判断へ移転不可 |
| X07–X11 | 2022–2025等、register参照 | web/software/system | normative/framework、N非該当 | 漏れ確認/analysis構造 | 実験効果なし、適合認定でない |
| X16 | 2026 | 日本、容器包装表示 | 行政発表、N非該当 | cashew/pistachio変更説明 | 法的適用の全体調査でない |

## Context7検索

resolve-library-idを各libraryで先行。選択理由: Next `/vercel/next.js` (High,91.33)、Prisma `/prisma/web` (High,76.82,公式v6 docs)、Clerk `/clerk/clerk-docs` (High,81.97)、Blob `/vercel/storage` (High,88.9、local emulatorではなく公式)。Next16.3.4一致tagが候補にないため最新資料との版差を留保。

- Next query: “For Next.js 16 revalidatePath called in a Route Handler, does it immediately invalidate browser Router Cache or refresh already open pages? Difference from Server Action and force-dynamic.”
- Prisma query: “Interactive transactions isolation level default PostgreSQL ReadCommitted, read modify write lost updates and optimistic concurrency control with version field available Prisma 6”
- Clerk query: “Backend User EmailAddress verification status verified primaryEmailAddressId currentUser server email identity”
- Blob query: “Vercel Blob put access public blobs URL accessible without authentication and del delete cache propagation”

Prismaの結果には旧previewの制約と新しい別runtime記述が混在したためv6明記のOCC/transactionだけ採用。Blobのlatestにあるprivate/get等をlock2.5.0で実装済みとは扱わない。技術sourceはE1〜E4の科学研究とは異なる公式仕様で、register上E2相当として区別。

# Losses, hazards, unsafe interactions

X10を参考にした**STPA-inspired**分析。多職種workshop/厨房観察/完全STPAではない。Lossの重大性を扱うが発生確率・定量risk rankingは算出しない。prototypeの直接scopeを越える身体被害は、実使用への誤転用も含む将来scenario。

Loss: L01 誤認に基づく飲食判断に寄与し身体被害へつながる。L02 必要情報を得られず利用機会を失う/過度に回避する。L03 店舗・利用者の情報/権限を侵害する。L04 原因特定・修正・復旧不能となり影響を長期化する。

| Hazard | Loss | Unsafe action / interaction | Loss scenario and evidence | Safety constraint / requirement |
| --- | --- | --- | --- | --- |
| H01 | L01 | unknown値をnegativeとして提供 | string cast→FREE fallback、EX01。将来enum/import不整合 | SC01/ SR-SEM-001 |
| H02 | L01/L02 | 欠損したmenuを公開、またはmaster不一致を無視 | API/DB迂回、master変更、flagだけ参照 | SC02/ SR-PUB-001 |
| H03 | L01/L03 | 別ownerまたは不確かなidentityへ変更許可 | resource ID差替え、guard/write時間差、email前提 | SC03/ SEC-OWN-001,SEC-ID-001 |
| H04 | L01/L04 | 正しい変更を古い入力で消す/結果不明を未保存と表示 | 2tab全status更新、commit後500、再POST | SC04/ DR-CON-001,DR-OUT-001 |
| H05 | L01/L04 | 古い根拠を現在の確認として公開 | recipe/仕入変更未通知、一般updatedAt更新、review証跡なし | SC05/ SR-REV-001,DR-PROV-001 |
| H06 | L01/L04 | 非公開/訂正を遅れて提供、表示を長く保持 | ISR・DB直接修正・open tab・別query時点差 | SC06/ SR-FRESH-001 |
| H07 | L01/L02 | 正しいdataでも誤る表示/伝達/対象 | 緑=安全、STORE_HANDLED=厨房確認、29以外、代理人設定違い、screen reader | SC07/ UX-COMP-001,UX-A11Y-001 |
| H08 | L03/L04 | 下書き/削除画像を想定外に提供 | public Blobはmenu公開と独立、orphan | SC08/ SEC-ASSET-001 |
| H09 | L01/L04 | 問題を検知/停止/照合しない、遅すぎる | best effort audit、通知/restore不明、provider結果不明 | SC09/ OR-INC-001 |
| H10 | L01/L03/L04 | localで検証したつもりの別構成を配備 | migration未適用、秘密値/client、旧package、proxy条件 | SC10/ OR-REL-001 |

Unsafe control actionを4種で点検した: 必要な操作をしない（変更報告/失効なし）、不適切な操作をする（不正公開/誤更新）、順序/時刻が悪い（stale merge/commit後失敗）、長すぎる/短すぎる（古い表示を維持/警告が消える）。正しいdata+誤UIと人同士の伝達も含む。

Counter scenarios: API/Zod/DB enumはH01の通常発生経路を遮断。既存共通公開関数とdeferred triggerはH02を抑える。ownerが1人でも2tabは可能だが発生頻度未測定。prototypeに本物の食品がなければL01への直接経路は限定される。risk候補をproduction incidentと記載しない。

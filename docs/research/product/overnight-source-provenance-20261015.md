# 調査7原稿の出典・取得・全文保持（2026-10-15 JST）

親から渡された7件のLibrary IDを正本として、正式手順により全文取得した。Windows Pythonではmetadata API非対応のため保存が失敗したが、許可された同じKaitoLaptopの既存Ubuntu/WSL Python3.12.3・ext4で無変更の正式helperを実行した。Library ID/版xattrs、提示サイズ、UTF-8、SHA256を7件とも検証し、Windows入力とrepo本文のbyte同一を確認した。新規インストール・WSL設定・別executor・Library writebackはない。

Libraryメタデータ付き入力は同PCのprivate Linux一時領域に保持している。Windows側のコピーとrepo docsは本文の派生保存であり、Windowsにxattrsがあるとは説明しない。正本のLibrary identityと版は以下に保持する。Library正本の置換は本作業の対象外。

| 原稿 | Library identity | file ID | 版 | UTF-8 byte | SHA256 |
| --- | --- | --- | --- | --- | --- |
| [ca-overnight-competition.md](../literature/ca-overnight-competition.md) | `libfile_2bf15490ebb08191b7d8bcec2d5babe1` | `file_0000000045ac8246bcad00363b67e0c1` | 0 | 17775 | `929f46068f6d361fda6572f972f6667f63902b89cec4afd950161b5466139e14` |
| [ca-overnight-adoption.md](../literature/ca-overnight-adoption.md) | `libfile_b55f1782610081918e6363213b73e023` | `file_000000005fd082119c5cbcb470a9aee4` | 0 | 19473 | `06808348176fea516d5b1c7f8fe72c5cc67366d31d91973d712dc51b7ddf7b07` |
| [ca-overnight-discovery.md](../literature/ca-overnight-discovery.md) | `libfile_9f1b37d718888191a630cecb74c5e9d6` | `file_0000000066f481f6a120e8984fa0f740` | 0 | 25328 | `a1891eeb245fbd069b2544432454e4a3b09363bee11ae516ad8a97c00c903abc` |
| [ca-overnight-integrity.md](../literature/ca-overnight-integrity.md) | `libfile_8821bda887088191a34ef6975da6f610` | `file_00000000528c81fdb63cd420c0417624` | 0 | 32404 | `4f9ef0ca60e12a2f4ec0aaeb02dbb4597df5811f72a32b3ca09f69a4316af9a3` |
| [ca-overnight-security-operations.md](../literature/ca-overnight-security-operations.md) | `libfile_dcc5d20f6a688191becd13146979baef` | `file_000000004424822f971e6bddda036f7f` | 0 | 26658 | `64e5b4554911ca9a8c37e31f5c629efe416d7a0c8ba7d7b39b177ec6fab92fd5` |
| [ca-overnight-decision-memo.md](ca-overnight-decision-memo.md) | `libfile_d271ff261e6c81919570ec757dc16ca6` | `file_0000000091f08211864cc529d68be177` | 0 | 32503 | `7b53a324224b7333c2175dcfb788ed955865f386483194101b88585c30582808` |
| [ca-overnight-independent-review.md](ca-overnight-independent-review.md) | `libfile_94a8a23d77488191aad1b3531fd2f5ae` | `file_00000000cb708211a7fa9a18133c40e3` | 0 | 18688 | `22e781017c81ebebfb507542677b908685c8b293eb5ec0accbb8a3457f20a4a1` |

7原稿は題名・本文・表・台本・出典URL・適用限界・末尾レビューまで省略せず、取得byteと同一のまま収録した。integrity Hの『検索から外す案を検証する／別枠案内と公開保留を比較／常時表示は未決』と、統合・独立レビューの最終修正も正本に含まれている。原稿の未確認は各著者の証拠範囲であり、現行実装の欠落とはしない。

[現行27Issue照合](../engineering/open-issues-current-code-20261015.md)が今回の固定main/静的/隔離実行を補い、[研究索引](../README.md)が読む順を示す。原稿と今回の別証拠を合成して、実食品・現場・本番・採用判断の検証済みへ昇格しない。外部URL全到達・全原典の独立再監査は今回未実施。

// 旧コマンドは既存のDB/Clerk認証情報を上書きするため廃止。
// 誤って実行されても環境ファイル・DB・Clerkを読み込まず、全環境で停止する。
console.error(
    "auth:create:test-user は廃止しました。専用テスト環境の準備は docs/guide/development.md の手順を確認してください。DB・Clerkへの変更は行っていません。",
);
process.exitCode = 1;

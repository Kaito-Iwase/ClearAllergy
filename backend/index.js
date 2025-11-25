//モジュールの読み込み
const express = require("express");
const cors = require("cors");
require("dotenv").config();

//アプリケーション本体の作成
const app = express();

//共通の設定
app.use(cors());
app.use(express.json());

//動作確認のためのエンドポイント
app.get("/", (req, res) => {
    res.json({ message: "API is working!!" });
});

//サーバーのポート番号設定
const PORT = process.env.PORT || 3001;

//サーバーの起動
app.listen(PORT, () => {
    console.log(`ClearAllergy API running at http://localhost:${PORT}`);
});

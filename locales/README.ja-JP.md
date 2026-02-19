<a name="readme-top"></a>

<p align="center">
  <h1 align="center">Lamino</h1>
  <p align="center"><b>インテリジェント LLM ワークスペース</b> — Orcest AI エコシステムの一部</p>
</p>

<p align="center">
  <a href="https://llm.orcest.ai">ライブインスタンス</a> |
  <a href="https://orcest.ai">Orcest AI</a> |
  <a href="../LICENSE">ライセンス (MIT)</a>
</p>

<p align="center">
  <a href='../README.md'>English</a> | <a href='./README.tr-TR.md'>Turkish</a> | <a href='./README.zh-CN.md'>简体中文</a> | <b>日本語</b> | <a href='./README.fa-IR.md'>فارسی</a>
</p>

任意のドキュメント、リソース、またはコンテンツの断片を、チャット中にLLMが参照として使用できるコンテキストに変換できるフルスタックアプリケーションです。Laminoは**RainyModel** (rm.orcest.ai) と統合されており、無料、内部、プレミアムプロバイダー間でインテリジェントなLLMルーティングと自動フォールバックを実現します。

### Orcest AI エコシステム

| サービス | ドメイン | 役割 |
|---------|--------|------|
| **Lamino** | llm.orcest.ai | LLM ワークスペース |
| **RainyModel** | rm.orcest.ai | LLM ルーティングプロキシ |
| **Maestrist** | agent.orcest.ai | AI エージェントプラットフォーム |
| **Orcide** | ide.orcest.ai | クラウド IDE |
| **Login** | login.orcest.ai | SSO 認証 |

## 機能

- 完全なMCP互換性
- ノーコードAIエージェントビルダー
- マルチモーダルサポート（クローズドソースとオープンソースの両方のLLM）
- カスタムAIエージェント
- マルチユーザーインスタンスサポートと権限管理（Docker版）
- ドラッグ＆ドロップ機能付きのシンプルなチャットUI
- 100%クラウドデプロイメント対応
- すべての主要なLLMプロバイダーと互換
- **RainyModel**によるインテリジェントLLMルーティング

## セルフホスティング

LaminoはDockerまたはベアメタルでデプロイできます。Docker以外のセットアップについては[BARE_METAL.md](../BARE_METAL.md)を参照してください。

## 開発環境のセットアップ

- `yarn setup` 必要な`.env`ファイルを入力します
- `yarn dev:server` ローカルでサーバーを起動します
- `yarn dev:frontend` ローカルでフロントエンドを起動します
- `yarn dev:collector` ドキュメントコレクターを実行します

## コントリビューション

コントリビューションガイドラインについては[CONTRIBUTING.md](../CONTRIBUTING.md)を参照してください。

---

このプロジェクトは[MIT](../LICENSE)ライセンスの下でライセンスされています。

[Orcest AI](https://orcest.ai)エコシステムの一部です。

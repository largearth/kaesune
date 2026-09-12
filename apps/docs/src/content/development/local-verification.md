---
title: ローカル検証手順
description: コミット前に行う共通の確認手順
order: 3
---

# ローカル検証手順

## 目的

変更した内容を、コミット前に同じ手順で確認できるようにする。

## 日常的に使うコマンド

- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## フックで自動実行するもの

`pre-commit` では `lint-staged` を実行する。

### format

- 対象ファイルを `prettier --check` で検証する

### lint

- `apps/web` の対象ファイルに対して `eslint` を実行する
- `apps/backend` の対象ファイルに対して `eslint` を実行する

### pre-push

- 自動チェックは行わない
- 必要に応じて `typecheck` や `build` を手動で実行する

## 補足

- `format` はリポジトリ全体に対して実行できる
- `lint-staged` はステージされたファイルだけを対象にする
- Browser verification を初めて実行する前に `pnpm verify:install-browser` で Chromium を導入する
- `pnpm verify:payment-create` は、検証専用のユーザー・グループ・財布を投入し、ログイン画面を操作せずに API で認証済み session を確立して出金作成を確認する。金額欄の初期フォーカス、当日日付、保存後の記録一覧を検証し、`verification-artifacts/payment-create-form.png` と `verification-artifacts/payment-create-after.png` を保存する
- `pnpm verify:records-delete` は、検証専用 fixture を投入して実画面の出金削除を確認し、`verification-artifacts/records-delete-after.png` を保存する
- `pnpm verify:wallet-delete` は、検証専用 fixture を投入して未参照財布の削除と参照中財布の削除拒否を実画面で確認し、`verification-artifacts/wallet-delete-after.png` を保存する
- テスト運用の詳細は [テスト運用](/development/test-operations) を参照する
- `pnpm build` で Next の開発キャッシュ由来の型エラーが出る場合は、`apps/web/.next` を消してから再実行する

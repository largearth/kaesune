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
- `pnpm verify:agent-control-payment-create` は、Agent Control daemon と独立した CLI process を通して出金を 1 件作成する。保存後の `/records` snapshot に用途と金額があることを検証し、`artifacts/agent/screenshots/` に full-page screenshot を保存する
- `pnpm verify:agent-control-phase2` は、Agent Controlのdoctor、出金作成、wait-settle、snapshot、console、network-summary、screenshotを一連のCLI操作として検証する
- `pnpm verify:invoices-list` は、検証専用の未精算・精算済み請求と関連データを投入し、実 API から請求対象メンバー・用途・返済先財布・金額・状態が表示されることと、状態フィルタを確認する。`verification-artifacts/invoices-list-all.png` と `verification-artifacts/invoices-list-settled.png` を保存する
- `pnpm verify:claim-create` は、検証専用の未配分出金を請求発行画面から操作し、配分保存と請求作成後に請求一覧へ遷移して、対象者・用途・返済先・金額・未精算状態を確認する。`verification-artifacts/claim-create-before.png` と `verification-artifacts/claim-create-after.png` を保存する
- `pnpm verify:records-delete` は、検証専用 fixture を投入して実画面の出金削除を確認し、`verification-artifacts/records-delete-after.png` を保存する
- `pnpm verify:wallet-delete` は、検証専用 fixture を投入して未参照財布の削除と参照中財布の削除拒否を実画面で確認し、`verification-artifacts/wallet-delete-after.png` を保存する
- テスト運用の詳細は [テスト運用](/development/test-operations) を参照する
- `pnpm build` で Next の開発キャッシュ由来の型エラーが出る場合は、`apps/web/.next` を消してから再実行する

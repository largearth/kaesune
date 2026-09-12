---
name: okaeshi-verification
description: Okaeshi のローカル Web UI または操作フローを、okaeshi-control で観察・操作し、画面状態と Evidence に基づいて検証する。
---

# Okaeshi verification

Okaeshi のローカル Web UI を実動作確認するときに使用する。検証の完了条件は `verification` Skill に従い、この Skill では Agent Control をいつ、何のために使うかを判断する。

```text
Skill = When / What
okaeshi-control = How
Okaeshi = Application
```

CLI の起動方法、引数、出力契約は [Okaeshi Agent Control](../../../apps/docs/src/content/development/agent-control.md) を参照する。Playwright API、locator、CSS selector を直接使わない。

## 検証を開始する

1. Web、Backend、Agent Control daemon をローカルの development 環境で起動する。
2. `pnpm okaeshi-control doctor` を実行し、必須 check がすべて成功した場合だけ続行する。
3. `pnpm okaeshi-control new-session` で fixture と認証済み session を作る。以前の検証状態を流用しない。

各 CLI 呼び出しの JSON `ok` と process exit code を確認する。`ok: false` または非 0 exit code を無視して次の操作へ進まない。

## 画面を観察して操作する

- 対象画面へ `goto` した後、`snapshot` で現在の URL、role、accessible name、label を確認する。
- 現在の snapshot で観察した意味情報に基づき、入力は `type`、native `<select>` は `select`、ボタン等は `click` を使う。
- 遷移が期待される click では `--wait-for-url` を指定する。通信や描画の完了を待つ必要がある場合は `wait-settle` を使う。
- 遷移、保存、削除などで状態が変わった後は新しい `snapshot` を取得する。操作前の snapshot を変更後状態の根拠にしない。

`select` は native `<select>` 専用である。custom combobox、listbox、独自の選択 UI は後続 Phase の対象とし、直接 Playwright 操作などで迂回しない。

## 成功を判定する

次を確認してから成功を宣言する。

1. 変更後の `snapshot` に期待する URL と表示内容がある。
2. `console --errors-only` を取得し、error がない。
3. 期待する状態を表示したまま `screenshot` を取得する。

通信不具合、保存失敗、期待しない状態が疑われる場合、または通信結果が検証対象の場合は `network-summary` を取得する。

Evidence には操作シナリオ、変更後 snapshot で確認した状態、console / network の確認結果、screenshot path を記録する。PR へ画像を添付する必要がある場合は `pr-evidence` Skill に従う。

## 出金作成の代表例

出金を作成する場合は、保存後の `/records` snapshot で用途 `E2E 出金作成` と金額 `¥1,200` の両方を確認してから screenshot を取得する。詳細なコマンド列は Agent Control の開発文書に従う。

## 失敗または未対応の場合

- `doctor` が失敗した場合は、失敗した check を検証環境の問題として扱い、session を作らない。
- `SEED_FAILED` の調査が必要な場合は `artifacts/agent/logs/agent-control-daemon.log` を確認する。内部エラー、stderr、機密情報を CLI の公開 interface、ユーザー向け報告、PR Evidence へ転載しない。
- 画面が変化して意味情報が古くなった場合は `snapshot` を再取得する。観察していない role、name、label を推測しない。
- custom combobox など未対応の操作が Done condition に必要な場合は、対応済みと見なさず `blocked-road-maintenance` Skill に従う。
- `info`、trace、performance profiling、cleanup、並列 session、任意 network interception は現行 Agent Control の対象外であり、利用可能なコマンドとして扱わない。

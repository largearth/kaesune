---
title: Okaeshi Agent Control
description: AI AgentがローカルのWebアプリを操作して検証するためのCLI
order: 6
---

# Okaeshi Agent Control

`okaeshi-control` は、AI Agent が同じ Playwright BrowserContext を複数の CLI 呼び出しで操作するためのローカル専用ツールです。Phase 2 では、Phase 1 の操作に加えて検証環境、console、network、画面の安定状態を観測できます。

## Agent Verification Skill

Okaeshi のローカル Web UI や操作フローを AI Agent が検証する場合は、`.agents/skills/okaeshi-verification/SKILL.md` に従います。Skill は検証場面に応じてどの観察・操作・Evidence が必要かを判断し、CLI はブラウザ操作の実装を担当します。

```text
Skill = When / What
okaeshi-control = How
Okaeshi = Application
```

Skill は Playwright API、locator、CSS selector を操作手順として持ちません。利用するのは現行 CLI が公開している `doctor`、`new-session`、`goto`、`snapshot`、`type`、native `select`、`click`、`wait-settle`、`console`、`network-summary`、`screenshot` だけです。`info`、trace、custom combobox などの未対応機能は後続 Phase の対象です。

## 起動

初回だけ Chromium をインストールします。

```sh
pnpm verify:install-browser
```

Web と Backend、Agent Control daemon をそれぞれ前景起動します。

```sh
pnpm dev
```

```sh
pnpm okaeshi-control:daemon
```

daemon は `127.0.0.1:4317` だけで待ち受けます。Agent Control は `ENVIRONMENT=development` の場合だけsessionを作成でき、productionでは利用できません。

起動後、sessionを作る前に検証環境を確認します。

```sh
pnpm okaeshi-control doctor
```

`doctor` は daemon、frontend、backend、browser を観測するだけで、停止した環境の起動や修復は行いません。必須checkが失敗した場合は `HEALTH_CHECK_FAILED` と非0 exit codeを返します。

## 出金作成シナリオ

`new-session` は既存の出金作成fixtureを冪等に投入し、前回の同名出金を削除してから、Better Auth APIで検証ユーザーのsessionを作成します。

```sh
pnpm okaeshi-control new-session
pnpm okaeshi-control goto /home
pnpm okaeshi-control snapshot
pnpm okaeshi-control click --role button --name "立て替えたお金を記録する"
pnpm okaeshi-control snapshot
pnpm okaeshi-control type --label 金額 --value 1200
pnpm okaeshi-control select --label "出金元の財布" --option "E2E 出金作成用財布"
pnpm okaeshi-control type --label 用途 --value "E2E 出金作成"
pnpm okaeshi-control click --role button --name "出金を記録する" --wait-for-url /records
pnpm okaeshi-control wait-settle
pnpm okaeshi-control snapshot
pnpm okaeshi-control console --errors-only
pnpm okaeshi-control network-summary
pnpm okaeshi-control screenshot
```

保存後の snapshot で `/records`、用途 `E2E 出金作成`、金額 `¥1,200` を確認します。スクリーンショットは `artifacts/agent/screenshots/` にfull-pageで保存されます。

全CLIは成功時に `ok: true`、失敗時に `ok: false` とエラーコードをJSONで返します。fixture commandの内部エラーとstderrは `artifacts/agent/logs/agent-control-daemon.log` に記録され、CLIには公開されません。CLI側では安全な定型メッセージを持つ `SEED_FAILED` に正規化されます。

## デバッグ観測

### console

```sh
pnpm okaeshi-control console
pnpm okaeshi-control console --errors-only
```

現在のsessionで発生した `console.error`、`console.warn`、uncaught page errorを返します。console errorが存在していても、取得に成功していれば `ok: true` です。`--errors-only` ではwarningsを省略します。

### network-summary

```sh
pnpm okaeshi-control network-summary
```

現在のsessionの総request数、4xx、5xx、request failureを要約します。frontend/backendへのrequestはqueryとhashを除いたpath、第三者へのrequestはoriginだけを返します。

### wait-settle

```sh
pnpm okaeshi-control wait-settle
```

呼び出し後、最後のnetwork eventから300ms間新しいactivityがない状態を待ちます。未完了requestが0になることは要求せず、5秒以内に安定しなければ `SETTLE_TIMEOUT` を返します。

`new-session` では以前のconsole/network情報を破棄します。Agent Controlはrequest/response body、header、console argument objectを収集しません。公開するmessageとfailure reasonからもAuthorization、Cookie、token、credential、password、secret、URL query/hashを除去します。

## 制約

- `select` はnative `<select>` だけを対象にし、Playwrightの `selectOption` を使用します。
- custom combobox、listbox、独自の選択UIは後続Phaseで対応します。
- `info`、trace、performance profiling、cleanup、並列session、任意network interceptionは対象外です。
- `goto` は `/` で始まるOkaeshiと同一originのpathだけを受け付けます。

## 固定検証

Web と Backend はPlaywright設定から起動され、daemonとCLIを通した一連の操作が実行されます。

```sh
pnpm verify:agent-control-payment-create
pnpm verify:agent-control-phase2
```

前者はPhase 1の操作回帰、後者はdoctorからEvidence screenshotまでのPhase 2固定scenarioを確認します。

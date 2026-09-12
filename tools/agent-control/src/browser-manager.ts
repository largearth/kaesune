import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  chromium,
  errors,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
} from "playwright";

import type { AgentControlConfig } from "./config.js";
import { AgentControlError } from "./errors.js";

export type SnapshotElement = {
  name: string;
  role: string;
  value?: string;
};

export type ConsoleEntry = {
  type: "console.error" | "console.warn" | "pageerror";
  message: string;
};

type NetworkTarget = { path: string } | { origin: string };

export type NetworkResponseEntry = NetworkTarget & {
  method: string;
  status: number;
};

export type NetworkRequestFailureEntry = NetworkTarget & {
  failureReason: string;
  method: string;
};

export type NetworkSummary = {
  total: number;
  failed: number;
  clientErrors: NetworkResponseEntry[];
  serverErrors: NetworkResponseEntry[];
  requestFailures: NetworkRequestFailureEntry[];
};

type AriaRole = Parameters<Page["getByRole"]>[0];

export class BrowserManager {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  private page: Page | undefined;
  private sessionId: string | undefined;
  private consoleErrors: ConsoleEntry[] = [];
  private consoleWarnings: ConsoleEntry[] = [];
  private totalRequests = 0;
  private clientErrors: NetworkResponseEntry[] = [];
  private serverErrors: NetworkResponseEntry[] = [];
  private requestFailures: NetworkRequestFailureEntry[] = [];
  private networkActivityVersion = 0;

  constructor(private readonly config: AgentControlConfig) {}

  async start(): Promise<void> {
    this.browser ??= await chromium.launch({ headless: true });
  }

  async createAuthenticatedSession(): Promise<{
    session: string;
    url: string;
  }> {
    await this.start();
    await this.closeContext();

    this.context = await this.browser!.newContext({
      viewport: { width: 393, height: 852 },
    });
    this.page = await this.context.newPage();
    this.attachDiagnostics(this.page);
    this.sessionId = randomUUID();

    try {
      const response = await this.context.request.post(
        `${this.config.apiOrigin}/api/auth/sign-in/email`,
        {
          data: {
            callbackURL: `${this.config.webOrigin}/home`,
            email: this.config.verificationUserEmail,
            password: this.config.verificationPassword,
          },
        },
      );

      if (!response.ok()) {
        throw new AgentControlError(
          "AUTH_FAILED",
          "検証用セッションを認証できませんでした。",
          500,
          {
            cause: new Error(
              `Better Auth returned ${response.status()}: ${await response.text()}`,
            ),
          },
        );
      }

      await this.page.goto(`${this.config.webOrigin}/home`, {
        waitUntil: "domcontentloaded",
      });
      return { session: this.sessionId, url: this.currentPath(this.page) };
    } catch (error) {
      await this.closeContext();
      if (error instanceof AgentControlError) throw error;
      throw new AgentControlError(
        "AUTH_FAILED",
        "検証用セッションを認証できませんでした。",
        500,
        { cause: error },
      );
    }
  }

  async goto(appPath: string): Promise<string> {
    const page = this.getPage();
    const url = this.resolveAppPath(appPath);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return this.currentPath(page);
    } catch (error) {
      throw new AgentControlError(
        "NAVIGATION_FAILED",
        `${appPath} へ移動できませんでした。`,
        500,
        { cause: error },
      );
    }
  }

  async snapshot(): Promise<{ elements: SnapshotElement[]; url: string }> {
    const page = this.getPage();
    const elements = await page
      .locator("h1,h2,h3,h4,h5,h6,button,a,input,textarea,select,[role]")
      .evaluateAll(collectSnapshotElements);

    return { elements, url: this.currentPath(page) };
  }

  async typeByLabel(label: string, value: string): Promise<string> {
    const page = this.getPage();
    const locator = page.getByLabel(label);

    try {
      await locator.fill(value, { timeout: 10_000 });
      return await locator.inputValue();
    } catch (error) {
      throw this.interactionError(error, `label が「${label}」の入力欄`);
    }
  }

  async selectByLabel(label: string, option: string): Promise<string> {
    const page = this.getPage();
    const locator = page.getByLabel(label);

    try {
      await locator.waitFor({ state: "visible", timeout: 10_000 });
      const tagName = await locator.evaluate((element) =>
        element.tagName.toLowerCase(),
      );
      if (tagName !== "select") {
        throw new AgentControlError(
          "INTERACTION_FAILED",
          "Phase 1のselectはnative <select>だけを操作できます。",
          422,
        );
      }
      const selected = await locator.selectOption({ label: option });
      if (selected.length === 0) {
        throw new AgentControlError(
          "ELEMENT_NOT_FOUND",
          `option「${option}」が見つかりませんでした。`,
          404,
        );
      }
      return await locator.locator("option:checked").innerText();
    } catch (error) {
      if (error instanceof AgentControlError) throw error;
      throw this.interactionError(error, `label が「${label}」のselect`);
    }
  }

  async clickByRole(
    role: AriaRole,
    name: string,
    waitForUrl?: string,
  ): Promise<string> {
    const page = this.getPage();

    try {
      await page.getByRole(role, { name, exact: true }).click({
        timeout: 10_000,
      });
    } catch (error) {
      throw this.interactionError(error, `${role}「${name}」`);
    }

    if (waitForUrl) {
      const expectedUrl = this.resolveAppPath(waitForUrl);
      try {
        await page.waitForURL(expectedUrl, { timeout: 10_000 });
      } catch (error) {
        throw new AgentControlError(
          "NAVIGATION_FAILED",
          `${waitForUrl} への遷移を確認できませんでした。`,
          500,
          { cause: error },
        );
      }
    }

    return this.currentPath(page);
  }

  async screenshot(): Promise<{ path: string; url: string }> {
    const page = this.getPage();
    const session = this.sessionId!;
    const timestamp = new Date()
      .toISOString()
      .replaceAll(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const screenshotDirectory = path.join(
      this.config.artifactRoot,
      "screenshots",
    );
    const filePath = path.join(
      screenshotDirectory,
      `${timestamp}-${session.slice(0, 8)}-${this.pathSlug(page)}.png`,
    );

    try {
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({ fullPage: true, path: filePath });
      return {
        path: path.relative(this.config.repoRoot, filePath),
        url: this.currentPath(page),
      };
    } catch (error) {
      throw new AgentControlError(
        "SCREENSHOT_FAILED",
        "スクリーンショットを保存できませんでした。",
        500,
        { cause: error },
      );
    }
  }

  consoleReport(options?: { errorsOnly?: boolean }): {
    errors: ConsoleEntry[];
    warnings?: ConsoleEntry[];
  } {
    this.getPage();
    const report: {
      errors: ConsoleEntry[];
      warnings?: ConsoleEntry[];
    } = { errors: [...this.consoleErrors] };
    if (!options?.errorsOnly) report.warnings = [...this.consoleWarnings];
    return report;
  }

  networkSummary(): NetworkSummary {
    this.getPage();
    return {
      total: this.totalRequests,
      failed:
        this.clientErrors.length +
        this.serverErrors.length +
        this.requestFailures.length,
      clientErrors: [...this.clientErrors],
      serverErrors: [...this.serverErrors],
      requestFailures: [...this.requestFailures],
    };
  }

  async waitForSettle(): Promise<{ settled: true; waitedMs: number }> {
    this.getPage();
    const startedAt = Date.now();
    let quietSince = startedAt;
    let observedActivityVersion = this.networkActivityVersion;

    while (Date.now() - startedAt < 5_000) {
      if (observedActivityVersion !== this.networkActivityVersion) {
        observedActivityVersion = this.networkActivityVersion;
        quietSince = Date.now();
      }
      if (Date.now() - quietSince >= 300) {
        return { settled: true, waitedMs: Date.now() - startedAt };
      }
      await delay(25);
    }

    throw new AgentControlError(
      "SETTLE_TIMEOUT",
      "Page did not settle within the allowed time",
      408,
    );
  }

  isBrowserConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  hasSession(): boolean {
    return Boolean(this.context && this.page && this.sessionId);
  }

  async stop(): Promise<void> {
    await this.closeContext();
    await this.browser?.close();
    this.browser = undefined;
  }

  private getPage(): Page {
    if (!this.page || !this.sessionId) {
      throw new AgentControlError(
        "SESSION_NOT_FOUND",
        "先にnew-sessionを実行してください。",
        409,
      );
    }
    return this.page;
  }

  private resolveAppPath(appPath: string): string {
    if (!appPath.startsWith("/") || appPath.startsWith("//")) {
      throw new AgentControlError(
        "INVALID_ARGUMENT",
        "pathには / で始まるOkaeshi内のpathを指定してください。",
        400,
      );
    }
    const url = new URL(appPath, this.config.webOrigin);
    if (url.origin !== this.config.webOrigin) {
      throw new AgentControlError(
        "INVALID_ARGUMENT",
        "Okaeshiと異なるoriginには移動できません。",
        400,
      );
    }
    return url.href;
  }

  private interactionError(error: unknown, target: string): AgentControlError {
    if (error instanceof errors.TimeoutError) {
      return new AgentControlError(
        "ELEMENT_NOT_FOUND",
        `${target}が見つかりませんでした。`,
        404,
        { cause: error },
      );
    }
    return new AgentControlError(
      "INTERACTION_FAILED",
      `${target}を操作できませんでした。`,
      422,
      { cause: error },
    );
  }

  private currentPath(page: Page): string {
    const url = new URL(page.url());
    return `${url.pathname}${url.search}${url.hash}`;
  }

  private pathSlug(page: Page): string {
    const slug = new URL(page.url()).pathname
      .replace(/^\/+|\/+$/g, "")
      .replaceAll(/[^a-zA-Z0-9-]+/g, "-");
    return slug || "root";
  }

  private attachDiagnostics(page: Page): void {
    page.on("console", (message) => this.collectConsoleMessage(message));
    page.on("pageerror", (error) => {
      this.consoleErrors.push({
        type: "pageerror",
        message: sanitizeDiagnosticText(error.message),
      });
    });
    page.on("request", () => this.collectRequest());
    page.on("response", (response) => this.collectResponse(response));
    page.on("requestfailed", (request) => this.collectRequestFailure(request));
  }

  private collectConsoleMessage(message: ConsoleMessage): void {
    if (message.type() === "error") {
      this.consoleErrors.push({
        type: "console.error",
        message: sanitizeDiagnosticText(message.text()),
      });
    } else if (message.type() === "warning") {
      this.consoleWarnings.push({
        type: "console.warn",
        message: sanitizeDiagnosticText(message.text()),
      });
    }
  }

  private collectRequest(): void {
    this.totalRequests += 1;
    this.markNetworkActivity();
  }

  private collectResponse(response: Response): void {
    this.markNetworkActivity();
    const status = response.status();
    if (status < 400 || status >= 600) return;

    const entry: NetworkResponseEntry = {
      method: response.request().method(),
      ...this.networkTarget(response.url()),
      status,
    };
    if (status < 500) this.clientErrors.push(entry);
    else this.serverErrors.push(entry);
  }

  private collectRequestFailure(request: Request): void {
    this.markNetworkActivity();
    this.requestFailures.push({
      method: request.method(),
      ...this.networkTarget(request.url()),
      failureReason: sanitizeDiagnosticText(
        request.failure()?.errorText ?? "Unknown request failure",
      ),
    });
  }

  private markNetworkActivity(): void {
    this.networkActivityVersion += 1;
  }

  private networkTarget(rawUrl: string): NetworkTarget {
    const url = new URL(rawUrl);
    const firstPartyOrigins = new Set([
      new URL(this.config.apiOrigin).origin,
      new URL(this.config.webOrigin).origin,
    ]);
    return firstPartyOrigins.has(url.origin)
      ? { path: url.pathname }
      : { origin: url.origin };
  }

  private resetDiagnostics(): void {
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.totalRequests = 0;
    this.clientErrors = [];
    this.serverErrors = [];
    this.requestFailures = [];
    this.networkActivityVersion = 0;
  }

  private async closeContext(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
    this.sessionId = undefined;
    this.resetDiagnostics();
  }
}

function sanitizeDiagnosticText(value: string): string {
  const withoutSensitiveHeaders = value.replace(
    /\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]*/giu,
    "$1: [REDACTED]",
  );
  const withoutSensitiveValues = withoutSensitiveHeaders.replace(
    /\b(token|credential|password|secret)\b(["']?\s*[:=]\s*["']?)[^"',;\s}\]]+/giu,
    "$1$2[REDACTED]",
  );
  const withoutBearer = withoutSensitiveValues.replace(
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu,
    "Bearer [REDACTED]",
  );
  const withoutJwt = withoutBearer.replace(
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
    "[REDACTED]",
  );
  return withoutJwt.replace(/https?:\/\/[^\s"'<>]+/giu, (candidate) => {
    try {
      const url = new URL(candidate);
      return `${url.origin}${url.pathname}`;
    } catch {
      return candidate;
    }
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function collectSnapshotElements(nodes: Element[]): SnapshotElement[] {
  const result: SnapshotElement[] = [];

  for (const element of nodes) {
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      element.getClientRects().length === 0
    ) {
      continue;
    }

    const tagName = element.tagName.toLowerCase();
    let role = element.getAttribute("role") ?? "";
    if (!role) {
      if (/^h[1-6]$/.test(tagName)) role = "heading";
      else if (tagName === "button") role = "button";
      else if (tagName === "a" && element.hasAttribute("href")) role = "link";
      else if (tagName === "textarea") role = "textbox";
      else if (tagName === "select") {
        const select = element as HTMLSelectElement;
        role = select.multiple || select.size > 1 ? "listbox" : "combobox";
      } else if (tagName === "input") {
        const type = (element as HTMLInputElement).type;
        if (type === "button" || type === "submit" || type === "reset") {
          role = "button";
        } else if (type === "checkbox") role = "checkbox";
        else if (type === "radio") role = "radio";
        else if (type === "range") role = "slider";
        else role = "textbox";
      }
    }
    if (!role) continue;

    let name = (element.getAttribute("aria-label") ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const labelledBy = element.getAttribute("aria-labelledby");
    if (!name && labelledBy) {
      const names: string[] = [];
      for (const id of labelledBy.split(/\s+/)) {
        const text = (document.getElementById(id)?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (text) names.push(text);
      }
      name = names.join(" ");
    }

    if (
      !name &&
      (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement)
    ) {
      const names: string[] = [];
      for (const label of Array.from(element.labels ?? [])) {
        const clone = label.cloneNode(true) as HTMLLabelElement;
        for (const control of clone.querySelectorAll(
          "input,textarea,select,button",
        )) {
          control.remove();
        }
        const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text) names.push(text);
      }
      name = names.join(" ");
    }

    if (!name) {
      name = (
        element.textContent ||
        element.getAttribute("title") ||
        element.getAttribute("placeholder") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
    }
    if (!name) continue;

    const item: SnapshotElement = { name, role };
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      item.value = element.value;
    } else if (element instanceof HTMLSelectElement) {
      const selected: string[] = [];
      for (const option of Array.from(element.selectedOptions)) {
        selected.push((option.textContent ?? "").replace(/\s+/g, " ").trim());
      }
      item.value = selected.join(", ");
    }
    result.push(item);
  }

  return result;
}

import { chromium, type Locator, type Page, type Browser } from 'playwright';
import { assert, AppError } from '../errors.js';
import { object, string } from '../validation.js';
import { render } from '../templates.js';
import type { Adapter, AdapterContext, AdapterResult, Capability, Input } from '../types.js';

interface Target { role?: string; name?: string; testId?: string; label?: string }
interface Assertion { target: Target; state: 'visible' | 'hidden' | 'text'; text?: string }
type Step =
  | { action: 'click'; target: Target }
  | { action: 'fill'; target: Target; value: string }
  | { action: 'press'; target: Target; key: string }
  | { action: 'read'; target: Target; as: string };
interface Workflow {
  url: string;
  cdpEndpoint?: string;
  headless?: boolean;
  preconditions: Assertion[];
  steps: Step[];
  postconditions: Assertion[];
}

function target(raw: unknown) {
  const value = object(raw, 'target');
  assert(Object.keys(value).every(k => ['role', 'name', 'testId', 'label'].includes(k)), 'INVALID_CONFIG', 'UI targets use role/name, testId or label');
  const count = [value.role, value.testId, value.label].filter(x => x !== undefined).length;
  assert(count === 1, 'INVALID_CONFIG', 'UI target must have exactly one locator strategy');
  if (value.role !== undefined) { string(value.role, 'role'); string(value.name, 'name'); }
  else { assert(value.name === undefined, 'INVALID_CONFIG', 'name requires role'); string(value.testId ?? value.label, 'target'); }
}

function locator(page: Page, spec: Target, input: Input): Locator {
  if (spec.testId) return page.getByTestId(render(spec.testId, input));
  if (spec.label) return page.getByLabel(render(spec.label, input), { exact: true });
  return page.getByRole(spec.role as Parameters<Page['getByRole']>[0], { name: render(spec.name!, input), exact: true });
}

async function check(page: Page, assertion: Assertion, input: Input) {
  const element = locator(page, assertion.target, input);
  if (assertion.state === 'hidden') { await element.waitFor({ state: 'hidden' }); return; }
  await element.waitFor({ state: 'visible' });
  assert(await element.count() === 1, 'AMBIGUOUS_TARGET', 'UI assertion matched multiple elements');
  if (assertion.state === 'text') {
    const expected = render(assertion.text!, input);
    const deadline = Date.now() + 10000;
    while ((await element.innerText()).trim() !== expected) {
      if (Date.now() >= deadline) throw new AppError('UI_ASSERTION_FAILED', 'Expected UI text did not appear');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

export class BrowserAdapter implements Adapter {
  readonly kind = 'browser';

  validate(config: Record<string, unknown>, capability: Capability) {
    assert(Object.keys(config).every(k => ['url', 'cdpEndpoint', 'headless', 'preconditions', 'steps', 'postconditions'].includes(k)), 'INVALID_CONFIG', 'Unknown browser config field');
    const url = new URL(string(config.url, 'url'));
    assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.href.includes('{{'), 'INVALID_CONFIG', 'Browser URL must be fixed HTTP(S) without credentials');
    if (config.cdpEndpoint !== undefined) {
      const endpoint = new URL(string(config.cdpEndpoint, 'cdpEndpoint'));
      assert(['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password, 'INVALID_CONFIG', 'Invalid CDP endpoint');
    }
    assert(config.headless === undefined || typeof config.headless === 'boolean', 'INVALID_CONFIG', 'headless must be boolean');
    for (const name of ['preconditions', 'postconditions']) {
      assert(Array.isArray(config[name]) && (config[name] as unknown[]).length > 0, 'INVALID_CONFIG', `${name} must contain at least one assertion`);
      for (const raw of config[name] as unknown[]) {
        const item = object(raw);
        assert(Object.keys(item).every(k => ['target', 'state', 'text'].includes(k)), 'INVALID_CONFIG', 'Unknown assertion field');
        target(item.target);
        assert(['visible', 'hidden', 'text'].includes(String(item.state)), 'INVALID_CONFIG', 'Invalid UI assertion state');
        if (item.state === 'text') assert(typeof item.text === 'string', 'INVALID_CONFIG', 'text assertion requires text');
      }
    }
    assert(Array.isArray(config.steps) && config.steps.length > 0, 'INVALID_CONFIG', 'steps must be a nonempty array');
    for (const raw of config.steps) {
      const step = object(raw);
      assert(['click', 'fill', 'press', 'read'].includes(String(step.action)), 'INVALID_CONFIG', 'Unsupported UI action');
      const fields: Record<string, string[]> = { click: ['action', 'target'], fill: ['action', 'target', 'value'], press: ['action', 'target', 'key'], read: ['action', 'target', 'as'] };
      assert(Object.keys(step).every(k => fields[String(step.action)]!.includes(k)), 'INVALID_CONFIG', 'Unknown UI step field');
      target(step.target);
      if (step.action === 'fill') assert(typeof step.value === 'string', 'INVALID_CONFIG', 'fill requires a string value');
      if (step.action === 'press') string(step.key, 'key');
      if (step.action === 'read') assert(/^[a-zA-Z][\w-]*$/.test(string(step.as, 'as')) && step.as !== 'verified', 'INVALID_CONFIG', 'Invalid read result name');
      assert(capability.effect !== 'read' || step.action === 'read', 'INVALID_CONFIG', 'Read capabilities cannot perform UI input actions');
    }
  }

  async execute(raw: Record<string, unknown>, input: Input, context: AdapterContext): Promise<AdapterResult> {
    const config = raw as unknown as Workflow;
    let browser: Browser | undefined;
    let page: Page | undefined;
    const cancel = () => { void page?.close().catch(() => {}); };
    context.signal.addEventListener('abort', cancel, { once: true });
    try {
      context.signal.throwIfAborted();
      browser = config.cdpEndpoint
        ? await chromium.connectOverCDP(config.cdpEndpoint)
        : await chromium.launch({ headless: config.headless ?? true });
      context.signal.throwIfAborted();
      if (config.cdpEndpoint) {
        // A dedicated tab avoids changing an unrelated page in an attached application.
        const existing = browser.contexts()[0];
        assert(existing, 'BROWSER_ERROR', 'CDP endpoint has no browser context');
        page = await existing.newPage();
      } else page = await browser.newPage();
      page.setDefaultTimeout(10000);
      page.setDefaultNavigationTimeout(15000);
      await page.goto(config.url, { waitUntil: 'domcontentloaded' });
      for (const assertion of config.preconditions) { context.signal.throwIfAborted(); await check(page, assertion, input); }
      const data: Record<string, string | boolean> = {};
      for (const step of config.steps) {
        context.signal.throwIfAborted();
        const element = locator(page, step.target, input);
        await element.waitFor({ state: 'visible' });
        assert(await element.count() === 1, 'AMBIGUOUS_TARGET', 'UI step matched multiple elements');
        if (step.action === 'click') await element.click();
        else if (step.action === 'fill') await element.fill(render(step.value, input));
        else if (step.action === 'press') await element.press(step.key);
        else data[step.as] = (await element.innerText()).trim();
      }
      for (const assertion of config.postconditions) { context.signal.throwIfAborted(); await check(page, assertion, input); }
      data.verified = true;
      assert(Buffer.byteLength(JSON.stringify(data)) <= context.maxOutputBytes, 'OUTPUT_LIMIT', 'UI result exceeded the output limit');
      return { data, evidence: { preconditions: config.preconditions.length, steps: config.steps.length, postconditions: config.postconditions.length } };
    } catch (error) {
      if (context.signal.aborted) throw new AppError('TIMEOUT', 'Browser execution timed out');
      if (error instanceof AppError) throw error;
      throw new AppError('UI_WORKFLOW_FAILED', 'UI workflow failed. Check app version, semantic targets and conditions; no automatic replay was attempted.');
    } finally {
      context.signal.removeEventListener('abort', cancel);
      await page?.close().catch(() => {});
      // close() disconnects an attached browser; a browser launched here is terminated.
      await browser?.close().catch(() => {});
    }
  }
}

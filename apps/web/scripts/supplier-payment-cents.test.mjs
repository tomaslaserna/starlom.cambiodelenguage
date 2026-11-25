import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const page = readFileSync(new URL('../src/app/administration/page.tsx', import.meta.url), 'utf8');
const expression = page.match(/<MoneyInput defaultValue=\{([^}]+)\} id=\{`admin-payable-/)?.[1];
assert.ok(expression, 'supplier payment amount input exists');
const suggested = Function('item', `return (${expression});`);
test('supplier payment suggestion preserves outstanding cents including prior schedules', () => {
 for (const [balance, scheduledAmount, expected] of [[99370.80,0,99370.80],[198741.60,99370.80,99370.80],[100.01,100,0.01],[100.99,0,100.99]]) {
  assert.equal(Number(suggested({balance,scheduledAmount}).toFixed(2)), expected);
 }
});

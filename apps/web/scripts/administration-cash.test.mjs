import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const module = { exports: {} };
const source = readFileSync(new URL('../src/lib/cash-projection.ts', import.meta.url), 'utf8');
Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports);
const { summarizeCashProjection } = module.exports;
test('future projections include opening cash, but never assume overdue or undated collection', () => {
  const result = summarizeCashProjection([
    { amount: 100, kind: 'inflow', date: '2026-11-19' },
    { amount: 25, kind: 'outflow', date: '2026-11-19' },
    { amount: 50, kind: 'inflow', date: null },
    { amount: 200, kind: 'inflow', date: '2026-11-20' },
    { amount: 75, kind: 'outflow', date: '2026-11-27' },
    { amount: 30, kind: 'inflow', date: '2026-11-28' },
  ], 1000, '2026-11-20');
  assert.equal(result.horizons[0].projectedBalance, 1125);
  assert.equal(result.horizons[0].net, 125);
  assert.equal(result.horizons[1].projectedBalance, 1155);
  assert.equal(result.overdue.inflow, 100);
  assert.equal(result.overdue.outflow, 25);
  assert.equal(result.undated.inflow, 50);
});
test('money is added in cents and inputs are not changed', () => {
  const items = [{ amount: 0.1, kind: 'inflow', date: '2026-11-20' }, { amount: 0.2, kind: 'inflow', date: '2026-11-20' }];
  const before = JSON.stringify(items);
  assert.equal(summarizeCashProjection(items, 0, '2026-11-20').horizons[0].projectedBalance, 0.3);
  assert.equal(JSON.stringify(items), before);
});

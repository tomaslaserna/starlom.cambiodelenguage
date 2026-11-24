import test from "node:test";

import assert from "node:assert/strict";

import { PGlite } from "@electric-sql/pglite";

import { readFileSync } from "node:fs";

import {
  createCostObligation,
  payCostObligation,
  readCostObligations,
} from "../src/lib/cost-obligations-core.ts";

import { obligationFixtureSql } from "../src/lib/cost-obligations-fixture.ts";

const actor = "11111111-1111-4111-8111-111111111111";

const key = "22222222-2222-4222-8222-222222222222";

async function setup() {
  const db = new PGlite();
  await db.exec(obligationFixtureSql);
  await db.exec(
    readFileSync(
      "../../supabase/migrations/20261124195400_monthly_cost_obligations.sql",
      "utf8",
    ),
  );
  return db;
}

const create = (tx, more = {}) =>
  createCostObligation(
    tx,
    1,
    actor,
    {
      costId: "expense:rent",
      month: "2026-11",
      dueDate: "2026-11-28",
      expectedRevision: 0,
      ...more,
    },
    "2026-11-24",
  );

const pay = (tx, id, more = {}) =>
  payCostObligation(
    tx,
    1,
    actor,
    {
      obligationId: id,
      requestId: key,
      accountId: "1",
      date: "2026-11-24",
      amountCents: 30000000,
      expectedPaidCents: 0,
      ...more,
    },
    "2026-11-24",
  );

test("partial payment and retries create one outflow; cost and historical movement unchanged", async () => {
  const db = await setup();
  try {
    const before = (await db.query("select * from admin_monthly_cost_ledger"))
      .rows;

    const o = await db.transaction((tx) => create(tx));
    assert.equal((await db.transaction((tx) => create(tx))).id, o.id);

    await db.transaction((tx) => pay(tx, o.id));
    await db.transaction((tx) => pay(tx, o.id));

    const rows = await readCostObligations(db, 1);
    assert.equal(rows[0].paidCents, 30000000);
    assert.equal(rows[0].balanceCents, 50000000);

    assert.equal(
      (
        await db.query(
          "select count(*)::int n from admin_treasury_movements where source_type='monthly_cost_payment'",
        )
      ).rows[0].n,
      1,
    );

    assert.deepEqual(
      (await db.query("select * from admin_monthly_cost_ledger")).rows,
      before,
    );

    assert.equal(
      (
        await db.query(
          "select amount from admin_treasury_movements where id=10",
        )
      ).rows[0].amount,
      "50.00",
    );

    await assert.rejects(
      db.transaction((tx) => pay(tx, o.id, { amountCents: 1 })),
      /reintento/i,
    );

    await assert.rejects(
      db.transaction((tx) =>
        pay(tx, o.id, {
          requestId: crypto.randomUUID(),
          amountCents: 50000001,
        }),
      ),
      /pendiente/i,
    );

    await db.transaction((tx) =>
      pay(tx, o.id, {
        requestId: crypto.randomUUID(),
        amountCents: 50000000,
        expectedPaidCents: 30000000,
      }),
    );

    assert.equal((await readCostObligations(db, 1))[0].balanceCents, 0);

    await assert.rejects(
      db.transaction((tx) =>
        pay(tx, o.id, { requestId: crypto.randomUUID(), amountCents: 1 }),
      ),
      /pendiente/i,
    );
  } finally {
    await db.close();
  }
});

test("invalid dates, pending costs, foreign/inactive accounts and foreign tenant cannot pay", async () => {
  const db = await setup();
  try {
    await assert.rejects(
      db.transaction((tx) => create(tx, { month: "2026-10" })),
      /histórico/i,
    );

    await assert.rejects(
      db.transaction((tx) => create(tx, { dueDate: "2026-02-30" })),
      /fecha/i,
    );

    await assert.rejects(
      db.transaction((tx) => create(tx, { costId: "expense:pending" })),
      /incluido/i,
    );

    const o = await db.transaction((tx) => create(tx));

    for (const input of [
      { accountId: "2" },
      { accountId: "3" },
      { date: "2026-11-25" },
      { date: "2026-10-20" },
    ])
      await assert.rejects(db.transaction((tx) => pay(tx, o.id, input)));

    await assert.rejects(
      db.transaction((tx) =>
        payCostObligation(
          tx,
          2,
          actor,
          {
            obligationId: o.id,
            requestId: key,
            accountId: "2",
            date: "2026-11-24",
            amountCents: 1,
          },
          "2026-11-24",
        ),
      ),
    );

    assert.equal((await readCostObligations(db, 1))[0].paidCents, 0);
  } finally {
    await db.close();
  }
});

test("existing manual outflow is linked once without another treasury movement", async () => {
  const db = await setup();
  try {
    const o = await db.transaction((tx) => create(tx));
    const before = (
      await db.query("select count(*)::int n from admin_treasury_movements")
    ).rows[0].n;

    const input = {
      existingMovementId: "10",
      amountCents: 5000,
      date: "2026-11-24",
    };

    await db.transaction((tx) => pay(tx, o.id, input));
    await db.transaction((tx) => pay(tx, o.id, input));

    assert.equal(
      (await db.query("select count(*)::int n from admin_treasury_movements"))
        .rows[0].n,
      before,
    );

    await assert.rejects(
      db.transaction((tx) =>
        pay(tx, o.id, {
          ...input,
          expectedPaidCents: 5000,
          requestId: crypto.randomUUID(),
        }),
      ),
      /vinculado/i,
    );

    assert.equal((await readCostObligations(db, 1))[0].paidCents, 5000);
  } finally {
    await db.close();
  }
});

test("transaction failure rolls back the outflow and allocation together", async () => {
  const db = await setup();
  try {
    const o = await db.transaction((tx) => create(tx));

    await assert.rejects(
      db.transaction(async (tx) => {
        await pay(tx, o.id);
        throw Error("simulated connection failure");
      }),
    );

    assert.equal((await readCostObligations(db, 1))[0].paidCents, 0);

    assert.equal(
      (
        await db.query(
          "select count(*)::int n from admin_treasury_movements where source_type='monthly_cost_payment'",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("stale tabs and simultaneous retry requests cannot pay twice", async () => {
  const db = await setup();
  try {
    const o = await db.transaction((tx) => create(tx));
    await Promise.all([
      db.transaction((tx) => pay(tx, o.id)),
      db.transaction((tx) => pay(tx, o.id)),
    ]);
    assert.equal((await readCostObligations(db, 1))[0].paidCents, 30000000);
    await assert.rejects(
      db.transaction((tx) => pay(tx, o.id, { requestId: crypto.randomUUID() })),
      /pendiente cambió/i,
    );
  } finally {
    await db.close();
  }
});
test("closed payment periods reject writes and RLS isolates other companies", async () => {
  const db = await setup();
  try {
    const o = await db.transaction((tx) => create(tx));
    await db.exec(
      "INSERT INTO admin_finance_monthly_closures(empresa_id,month,status) VALUES(1,'2026-11-01','closed')",
    );
    await assert.rejects(
      db.transaction((tx) => pay(tx, o.id)),
      /cerrado/i,
    );
    await assert.rejects(
      db.transaction((tx) => create(tx, { costId: "expense:internet" })),
      /cerrado/i,
    );
    await db.exec(
      "SET ROLE starlim_app; SELECT set_config('app.current_empresa_id','2',false)",
    );
    assert.equal(
      (await db.query("SELECT * FROM admin_cost_obligations")).rows.length,
      0,
    );
    await assert.rejects(
      db.exec("DELETE FROM admin_cost_obligations"),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});

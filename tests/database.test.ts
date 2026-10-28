import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const migration = readFileSync("supabase/migrations/001_campaign.sql", "utf8");
type Snapshot = {
  total_cents: number;
  count: number;
  campaign: Record<string, unknown>;
  donations: { id: string; name: string; amount_cents: number }[];
  updates: { id: string; title: string }[];
};
function entry(overrides: Record<string, unknown> = {}) {
  return {
    amount: 5000,
    received_at: new Date().toISOString(),
    is_anonymous: true,
    donor_public_name: "PRIVATE NAME",
    consent_note: "",
    payment_reference: crypto.randomUUID(),
    admin_notes: "PRIVATE NOTES",
    request_id: crypto.randomUUID(),
    id: "",
    version: 0,
    ...overrides,
  };
}
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create publication supabase_realtime;
    -- Explicit API grants mimic Supabase project default privileges. Also test
    -- inherited PUBLIC privileges, instead of relying on a pristine PostgreSQL.
    alter default privileges in schema public grant all on tables to public, anon, authenticated;
    alter default privileges in schema public grant all on sequences to public, anon, authenticated;
    alter default privileges in schema public grant all on functions to public, anon, authenticated;
  `);
  await db.exec(migration);
  await db.exec(`
    insert into auth.users values ('${ADMIN}'), ('${OTHER}');
    insert into public.admin_users(user_id) values ('${ADMIN}');
  `);
  const role = async (name: "owner" | "anon" | "authenticated", uid = "") => {
    await db.exec("reset role");
    if (name !== "owner") await db.exec(`set role ${name}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      uid,
    ]);
  };
  const snapshot = async () =>
    (await db.query<{ s: Snapshot }>("select public.public_snapshot() s"))
      .rows[0].s;
  const add = async (payload: object) =>
    (
      await db.query<{ id: string }>(
        "select public.record_donation($1::jsonb) id",
        [JSON.stringify(payload)],
      )
    ).rows[0].id;
  return { db, role, snapshot, add };
}

test("GRANT/REVOKE, SECURITY DEFINER e RLS resistem aos privilégios padrão do Supabase", async () => {
  const { db, role, snapshot, add } = await fixture();
  try {
    const functions = await db.query<{
      proname: string;
      prosecdef: boolean;
      proconfig: string[];
    }>(`
      select proname, prosecdef, proconfig from pg_proc
      where oid in ('public.is_admin()'::regprocedure, 'public.audit_change()'::regprocedure,
        'public.record_donation(jsonb)'::regprocedure, 'public.cancel_donation(uuid,integer)'::regprocedure,
        'public.public_snapshot()'::regprocedure)
    `);
    assert.equal(functions.rows.length, 5);
    for (const fn of functions.rows) {
      assert.equal(fn.prosecdef, true, fn.proname);
      assert.ok(
        fn.proconfig.some((s) => s === 'search_path=""'),
        fn.proname,
      );
    }
    assert.equal(
      (
        await db.query(
          "select * from pg_policy where polrelid='public.donations'::regclass and polcmd<>'r'",
        )
      ).rows.length,
      0,
    );
    for (const who of ["anon", "authenticated"] as const) {
      await role(who, who === "anon" ? "" : OTHER);
      assert.equal((await snapshot()).total_cents, 0);
      for (const table of [
        "donations",
        "audit_logs",
        "admin_users",
        "campaigns",
        "campaign_updates",
        "campaign_signal",
      ]) {
        const privileges = (
          await db.query<{
            insert: boolean;
            update: boolean;
            delete: boolean;
            truncate: boolean;
          }>(
            `
          select has_table_privilege(current_user, $1, 'INSERT') as insert,
            has_table_privilege(current_user, $1, 'UPDATE') as update,
            has_table_privilege(current_user, $1, 'DELETE') as delete,
            has_table_privilege(current_user, $1, 'TRUNCATE') as truncate
        `,
            [`public.${table}`],
          )
        ).rows[0];
        if (
          [
            "donations",
            "audit_logs",
            "admin_users",
            "campaign_signal",
          ].includes(table) ||
          who === "anon"
        ) {
          assert.deepEqual(
            privileges,
            { insert: false, update: false, delete: false, truncate: false },
            `${who}: ${table}`,
          );
        }
        if (who === "anon" && table !== "campaign_signal") {
          await assert.rejects(
            db.query(`select * from public.${table}`),
            /permission denied/,
          );
        }
      }
      await assert.rejects(
        db.query("select public.audit_change()"),
        /permission denied/,
      );
      if (who === "anon") {
        await assert.rejects(add(entry()), /permission denied/);
        await assert.rejects(
          db.query("select public.cancel_donation($1::uuid,1)", [
            crypto.randomUUID(),
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select public.is_admin()"),
          /permission denied/,
        );
      } else {
        for (const table of [
          "donations",
          "audit_logs",
          "admin_users",
          "campaigns",
          "campaign_updates",
        ]) {
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
        }
        await assert.rejects(add(entry()), /Administrator required/);
        await assert.rejects(
          db.query("select public.cancel_donation($1::uuid,1)", [
            crypto.randomUUID(),
          ]),
          /Administrator required/,
        );
        assert.equal(
          (
            await db.query(
              "update public.campaigns set updated_at=now() returning id",
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          db.query(
            "insert into public.campaign_updates(title,body,publication_consent) values('ABC','DEF',true)",
          ),
          /row-level security/,
        );
      }
      await assert.rejects(
        db.query("insert into public.admin_users(user_id) values ($1)", [
          OTHER,
        ]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("delete from public.admin_users"),
        /permission denied/,
      );
      assert.equal(
        (
          await db.query<{ ok: boolean }>(
            "select has_sequence_privilege(current_user,'public.audit_logs_id_seq','USAGE') ok",
          )
        ).rows[0].ok,
        false,
      );
    }
  } finally {
    await db.close();
  }
});

test("administradores não podem escrever diretamente no financeiro nem alterar auditoria/sinal", async () => {
  const { db, role, add, snapshot } = await fixture();
  try {
    await role("authenticated", ADMIN);
    const id = await add(entry());
    for (const sql of [
      "insert into public.donations(amount_cents) values(1)",
      "update public.donations set amount_cents=1",
      "update public.donations set status='cancelled'",
      "delete from public.donations",
      "truncate public.donations cascade",
      "insert into public.audit_logs(actor,table_name,record_id,operation) values(auth.uid(),'donations','x','INSERT')",
      "update public.audit_logs set before_data='{}'::jsonb",
      "delete from public.audit_logs",
      "update public.campaign_signal set revision=10000",
      "insert into public.admin_users(user_id) values('00000000-0000-4000-8000-000000000002')",
      "delete from public.admin_users",
    ])
      await assert.rejects(db.query(sql), /permission denied/, sql);
    assert.equal((await snapshot()).total_cents, 5000);
    // Even an accidental future table-level regrant cannot bypass financial RLS.
    await role("owner");
    await db.exec(
      "grant insert, update, delete on public.donations to authenticated",
    );
    await role("authenticated", ADMIN);
    assert.equal(
      (
        await db.query(
          "update public.donations set amount_cents=1 where id=$1 returning id",
          [id],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "delete from public.donations where id=$1 returning id",
          [id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        `insert into public.donations(amount_cents,received_at,request_id,request_fingerprint)
      values(100,now(),$1,repeat('a',64))`,
        [crypto.randomUUID()],
      ),
      /row-level security/,
    );
    assert.equal((await snapshot()).total_cents, 5000);
    // Privileged SQL Editor alone manages admin membership; revocation is immediate.
    await role("owner");
    await db.query("delete from public.admin_users where user_id=$1", [ADMIN]);
    await role("authenticated", ADMIN);
    assert.equal(
      (await db.query("select * from public.donations")).rows.length,
      0,
    );
    await assert.rejects(add(entry()), /Administrator required/);
    await assert.rejects(
      db.query("select public.cancel_donation($1::uuid,1)", [id]),
      /Administrator required/,
    );
  } finally {
    await db.close();
  }
});

test("auditoria genérica: campanhas com id booleano e comunicados INSERT/UPDATE/DELETE", async () => {
  const { db, role, snapshot } = await fixture();
  try {
    await role("authenticated", ADMIN);
    await db.query(
      `update public.campaigns set content=jsonb_set(content,'{goal_cents}','8000000') where id=true`,
    );
    const audit = (
      await db.query<{
        record_id: string;
        operation: string;
        before_data: { id: boolean; content: { goal_cents: number } };
        after_data: { id: boolean; content: { goal_cents: number } };
        actor: string;
      }>("select * from public.audit_logs where table_name='campaigns'")
    ).rows[0];
    assert.equal(audit.record_id, "true");
    assert.equal(audit.operation, "UPDATE");
    assert.equal(audit.before_data.id, true);
    assert.equal(audit.before_data.content.goal_cents, 10000000);
    assert.equal(audit.after_data.id, true);
    assert.equal(audit.after_data.content.goal_cents, 8000000);
    assert.equal(audit.actor, ADMIN);
    const update = (
      await db.query<{ id: string }>(
        "insert into public.campaign_updates(title,body,publication_consent) values('Comunicado','Texto autorizado',true) returning id",
      )
    ).rows[0];
    await db.query(
      "update public.campaign_updates set body='Texto corrigido' where id=$1",
      [update.id],
    );
    await db.query("delete from public.campaign_updates where id=$1", [
      update.id,
    ]);
    const rows = (
      await db.query<{
        record_id: string;
        operation: string;
        before_data: { body: string } | null;
        after_data: { body: string } | null;
      }>(
        "select * from public.audit_logs where table_name='campaign_updates' order by id",
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => r.operation),
      ["INSERT", "UPDATE", "DELETE"],
    );
    assert.ok(rows.every((r) => r.record_id === update.id));
    assert.equal(rows[0].before_data, null);
    assert.equal(rows[0].after_data?.body, "Texto autorizado");
    assert.equal(rows[1].before_data?.body, "Texto autorizado");
    assert.equal(rows[1].after_data?.body, "Texto corrigido");
    assert.equal(rows[2].before_data?.body, "Texto corrigido");
    assert.equal(rows[2].after_data, null);
    assert.equal(
      (
        await db.query<{ revision: number }>(
          "select revision from public.campaign_signal",
        )
      ).rows[0].revision,
      4,
    );
    assert.equal((await snapshot()).campaign.goal_cents, 8000000);
    assert.equal((await snapshot()).updates.length, 0);
    for (const patch of [
      { goal_cents: null },
      { goal_cents: 0 },
      { goal_cents: 1.5 },
      { publication_consent: null },
      { pix_enabled: null },
      { gallery_urls: null },
    ]) {
      await assert.rejects(
        db.query("update public.campaigns set content=content || $1::jsonb", [
          JSON.stringify(patch),
        ]),
        /check constraint/,
      );
    }
    await assert.rejects(
      db.query("update public.campaigns set content=content-'goal_cents'"),
      /check constraint/,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*) n from public.audit_logs",
        )
      ).rows[0].n,
      4,
    );
    await assert.rejects(
      db.query("update public.campaigns set id=false"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("registro, correção e cancelamento preservam contabilidade, autoria e auditoria", async () => {
  const { db, role, add, snapshot } = await fixture();
  try {
    await role("authenticated", ADMIN);
    const input = entry();
    const id = await add(input);
    assert.equal(await add(input), id);
    assert.equal((await snapshot()).total_cents, 5000);
    assert.equal((await snapshot()).count, 1);
    const correction = {
      ...input,
      id,
      version: 1,
      amount: 7500,
      request_id: crypto.randomUUID(),
    };
    const replacement = await add(correction);
    assert.equal(await add(correction), replacement);
    const original = (
      await db.query<{ status: string; version: number; amount_cents: number }>(
        "select * from public.donations where id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(original.status, "corrected");
    assert.equal(original.version, 2);
    assert.equal(original.amount_cents, 5000);
    const corrected = (
      await db.query<{
        replaces_id: string;
        confirmed_by: string;
        request_fingerprint: string;
      }>("select * from public.donations where id=$1", [replacement])
    ).rows[0];
    assert.equal(corrected.replaces_id, id);
    assert.equal(corrected.confirmed_by, ADMIN);
    assert.equal(corrected.request_fingerprint.length, 64);
    assert.equal((await snapshot()).total_cents, 7500);
    assert.equal((await snapshot()).count, 1);
    await assert.rejects(
      add({ ...correction, request_id: crypto.randomUUID() }),
      /Registro alterado/,
    );
    await assert.rejects(
      db.query("select public.cancel_donation($1::uuid,1)", [id]),
      /Registro alterado/,
    );
    await assert.rejects(
      db.query("select public.cancel_donation($1::uuid,2)", [replacement]),
      /Registro alterado/,
    );
    await db.query("select public.cancel_donation($1::uuid,1)", [replacement]);
    await assert.rejects(
      db.query("select public.cancel_donation($1::uuid,1)", [replacement]),
      /Registro alterado/,
    );
    assert.equal((await snapshot()).total_cents, 0);
    assert.equal((await snapshot()).count, 0);
    assert.equal((await snapshot()).donations.length, 0);
    assert.equal(
      (await db.query("select * from public.donations")).rows.length,
      2,
    );
    const logs = (
      await db.query<{
        operation: string;
        before_data: { status: string } | null;
        after_data: { status: string };
      }>("select * from public.audit_logs order by id")
    ).rows;
    assert.equal(logs.length, 4);
    assert.deepEqual(
      logs.map((r) => [
        r.operation,
        r.before_data?.status ?? null,
        r.after_data.status,
      ]),
      [
        ["INSERT", null, "confirmed"],
        ["UPDATE", "confirmed", "corrected"],
        ["INSERT", null, "confirmed"],
        ["UPDATE", "confirmed", "cancelled"],
      ],
    );
  } finally {
    await db.close();
  }
});

test("RPC rejeita versão nula, payload inválido e reutilização divergente; falhas são atômicas", async () => {
  const { db, role, add, snapshot } = await fixture();
  try {
    await role("authenticated", ADMIN);
    const input = entry();
    const id = await add(input);
    const duplicateRef = entry();
    await add(duplicateRef);
    await assert.rejects(
      add({ ...input, amount: 1 }),
      /reutilizado com dados diferentes/,
    );
    for (const overrides of [
      { amount: 0 },
      { amount: -1 },
      { amount: 1.5 },
      { amount: 100000001 },
      { amount: null },
      { amount: "5000" },
      { request_id: null },
      { request_id: "bad" },
      { is_anonymous: null },
      { is_anonymous: "true" },
      { received_at: "infinity" },
      { received_at: "2099-01-01T00:00:00Z" },
      { received_at: "2026-01-01T00:00:00" },
      { consent_note: "x".repeat(1001) },
      { admin_notes: "x".repeat(2001) },
      { donor_public_name: { private: "object" } },
      { payment_reference: "x".repeat(151) },
    ])
      await assert.rejects(add(entry(overrides)), JSON.stringify(overrides));
    for (const version of [undefined, null, 0, -1, 2, 1.5]) {
      const correction: Record<string, unknown> = {
        ...input,
        id,
        request_id: crypto.randomUUID(),
        amount: 7500,
        version,
      };
      await assert.rejects(add(correction));
    }
    await assert.rejects(
      add({
        ...input,
        id,
        version: 1,
        amount: 7500,
        request_id: crypto.randomUUID(),
        payment_reference: duplicateRef.payment_reference,
      }),
      /duplicate key/,
    );
    await assert.rejects(
      add({
        ...input,
        id,
        version: 1,
        amount: 7500,
        request_id: crypto.randomUUID(),
        is_anonymous: false,
        donor_public_name: "Nome sem consentimento",
      }),
      /check constraint/,
    );
    for (const version of [null, 0, -1])
      await assert.rejects(
        db.query("select public.cancel_donation($1::uuid,$2::integer)", [
          id,
          version,
        ]),
        /versão.*inválidos/,
      );
    assert.equal((await snapshot()).total_cents, 10000);
    assert.equal((await snapshot()).count, 2);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.donations where id=$1",
          [id],
        )
      ).rows[0].status,
      "confirmed",
    );
    assert.equal(
      (await db.query("select * from public.audit_logs")).rows.length,
      2,
    );
    assert.equal(
      (
        await db.query<{ revision: number }>(
          "select revision from public.campaign_signal",
        )
      ).rows[0].revision,
      2,
    );
  } finally {
    await db.close();
  }
});

test("snapshot público divulga apenas campos permitidos e nomes com consentimento", async () => {
  const { db, role, add, snapshot } = await fixture();
  try {
    await role("authenticated", ADMIN);
    await db.query(`update public.campaigns set content=content || $1::jsonb`, [
      JSON.stringify({
        story: "PRIVATE HEALTH",
        photo_url: "https://example.com/private.jpg",
        gallery_urls: ["https://example.com/private2.jpg"],
        pix_key: "PRIVATE PIX",
        pix_name: "PRIVATE ACCOUNT",
        pix_city: "PRIVATE CITY",
        internal_notes: "PRIVATE INTERNAL",
        future_finance: { secret: "PRIVATE FUTURE" },
      }),
    ]);
    await add(entry());
    await add(
      entry({
        is_anonymous: false,
        donor_public_name: "Nome autorizado",
        consent_note: "PRIVATE CONSENT EVIDENCE",
      }),
    );
    const publicKeys = ["id", "amount_cents", "received_at", "name"].sort();
    await role("anon");
    const data = await snapshot();
    assert.equal(data.total_cents, 10000);
    assert.equal(data.count, 2);
    assert.ok(!JSON.stringify(data).includes("PRIVATE"));
    assert.equal(data.campaign.story, "");
    assert.deepEqual(data.campaign.gallery_urls, []);
    assert.equal(data.campaign.pix_key, "");
    assert.ok(data.donations.some((d) => d.name === "Doador anônimo"));
    assert.ok(data.donations.some((d) => d.name === "Nome autorizado"));
    for (const d of data.donations)
      assert.deepEqual(Object.keys(d).sort(), publicKeys);
    assert.deepEqual(
      Object.keys(data.campaign).sort(),
      [
        "contact_email",
        "beneficiary",
        "summary",
        "story",
        "message",
        "expenses",
        "photo_url",
        "gallery_urls",
        "publication_consent",
        "goal_cents",
        "pix_key",
        "pix_name",
        "pix_city",
        "pix_enabled",
      ].sort(),
    );
    await role("authenticated", ADMIN);
    await db.query(
      `update public.campaigns set content=content || '{"publication_consent":true,"pix_enabled":true}'::jsonb`,
    );
    await role("anon");
    const published = await snapshot();
    assert.equal(published.campaign.story, "PRIVATE HEALTH");
    assert.equal(published.campaign.pix_key, "PRIVATE PIX");
    assert.equal(published.campaign.internal_notes, undefined);
    assert.equal(published.campaign.future_finance, undefined);
  } finally {
    await db.close();
  }
});

test("limite de operações desfaz correção e auditoria parciais na mesma transação", async () => {
  const { db, role, add, snapshot } = await fixture();
  try {
    await role("authenticated", ADMIN);
    const input = entry();
    const id = await add(input);
    for (let i = 1; i < 59; i++) await add(entry());
    const before = await snapshot();
    // Correction needs two audit rows. Its second row hits the limit; both writes roll back.
    await assert.rejects(
      add({
        ...input,
        id,
        version: 1,
        amount: 7500,
        request_id: crypto.randomUUID(),
      }),
      /Limite de operações/,
    );
    assert.equal((await snapshot()).total_cents, before.total_cents);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.donations where id=$1",
          [id],
        )
      ).rows[0].status,
      "confirmed",
    );
    assert.equal(
      (await db.query("select * from public.audit_logs")).rows.length,
      59,
    );
    assert.equal(
      (
        await db.query<{ revision: number }>(
          "select revision from public.campaign_signal",
        )
      ).rows[0].revision,
      59,
    );
    await add(entry());
    await assert.rejects(add(entry()), /Limite de operações/);
    await assert.rejects(
      db.query("select public.cancel_donation($1::uuid,1)", [id]),
      /Limite de operações/,
    );
    assert.equal((await snapshot()).total_cents, 300000);
    assert.equal((await snapshot()).count, 60);
    assert.equal(
      (await db.query("select * from public.audit_logs")).rows.length,
      60,
    );
  } finally {
    await db.close();
  }
});

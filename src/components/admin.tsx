"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelDonation,
  saveCampaign,
  saveDonation,
  saveUpdate,
  removeUpdate,
  type ActionResult,
} from "@/app/admin/actions";
import { cents, indicators, money, type Snapshot } from "@/lib/model";
import type { Donation, Audit } from "@/lib/admin-model";
export function Admin({
  snapshot,
  donations,
  audit,
}: {
  snapshot: Snapshot;
  donations: Donation[];
  audit: Audit[];
}) {
  const [tab, setTab] = useState("Doações"),
    [edit, setEdit] = useState<Donation | null>(null),
    [result, setResult] = useState<ActionResult | null>(null),
    [pending, start] = useTransition();
  const router = useRouter();
  const request = useRef("");
  const [formVersion, setFormVersion] = useState(0);
  const s = indicators(snapshot.total_cents, snapshot.campaign.goal_cents);
  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setResult(null);
    start(async () => {
      try {
        const r = await action();
        setResult(r);
        if (r.ok) {
          after?.();
          router.refresh();
        }
      } catch {
        setResult({
          ok: false,
          message:
            "Falha na conexão. Reenvie o mesmo formulário para evitar duplicidade.",
        });
      }
    });
  }
  function donation(form: FormData) {
    if (!request.current) request.current = crypto.randomUUID();
    let received: string;
    try {
      received = new Date(String(form.get("received_at"))).toISOString();
    } catch {
      setResult({ ok: false, message: "Informe uma data válida." });
      return;
    }
    run(
      () =>
        saveDonation({
          amount: form.get("amount"),
          received_at: received,
          is_anonymous: form.get("anonymous") === "on",
          donor_public_name: form.get("name") || "",
          consent_note: form.get("consent") || "",
          payment_reference: form.get("reference") || "",
          admin_notes: form.get("notes") || "",
          request_id: request.current,
          id: edit?.id || "",
          version: edit?.version || 0,
        }),
      () => {
        request.current = "";
        setEdit(null);
        setFormVersion((v) => v + 1);
      },
    );
  }
  return (
    <>
      <div className="admin-stats">
        <div>
          <small>Arrecadados</small>
          <strong>{money(snapshot.total_cents)}</strong>
        </div>
        <div>
          <small>Meta</small>
          <strong>{money(snapshot.campaign.goal_cents)}</strong>
        </div>
        <div>
          <small>Faltam</small>
          <strong>{money(s.remaining)}</strong>
        </div>
        <div>
          <small>Doações confirmadas</small>
          <strong>
            {snapshot.count} · {s.percent.toFixed(2)}%
          </strong>
        </div>
      </div>
      <p className="muted">
        Última atualização:{" "}
        {snapshot.updated_at
          ? new Date(snapshot.updated_at).toLocaleString("pt-BR")
          : "nenhum registro"}
      </p>
      <div className="admin-tabs">
        {["Doações", "Campanha e Pix", "Atualizações", "Auditoria"].map((t) => (
          <button
            key={t}
            className="outline"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {result && (
        <p role="status" className={result.ok ? "success" : "error"}>
          {result.message}
        </p>
      )}
      {tab === "Doações" && (
        <div className="admin-grid">
          <section className="admin-panel">
            <h2>{edit ? "Corrigir lançamento" : "Registrar recebimento"}</h2>
            <p className="admin-warning">
              Registre somente após conferir o dinheiro recebido no extrato.
              Correções mantêm o registro original no histórico.
            </p>
            <form action={donation} key={edit?.id || `new-${formVersion}`}>
              <label>
                Valor recebido (R$)
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  defaultValue={
                    edit ? (edit.amount_cents / 100).toFixed(2) : ""
                  }
                />
              </label>
              <label>
                Data e horário do recebimento (horário deste dispositivo)
                <input
                  name="received_at"
                  type="datetime-local"
                  required
                  defaultValue={edit ? localDate(edit.received_at) : ""}
                />
              </label>
              <label>
                <input
                  name="anonymous"
                  type="checkbox"
                  defaultChecked={edit ? edit.is_anonymous : true}
                />{" "}
                Manter doador anônimo
              </label>
              <label>
                Nome público autorizado
                <input
                  name="name"
                  maxLength={100}
                  defaultValue={edit?.donor_public_name}
                />
              </label>
              <label>
                Registro da autorização para divulgar o nome
                <textarea
                  name="consent"
                  maxLength={1000}
                  defaultValue={edit?.consent_note}
                />
              </label>
              <label>
                Referência única do extrato (quando disponível)
                <input
                  name="reference"
                  maxLength={150}
                  defaultValue={edit?.payment_reference || ""}
                />
              </label>
              <label>
                Observações privadas
                <textarea
                  name="notes"
                  maxLength={2000}
                  defaultValue={edit?.admin_notes}
                />
              </label>
              <label>
                <input type="checkbox" required /> Conferi o recebimento no
                extrato bancário.
              </label>
              <button className="button full" disabled={pending}>
                {pending
                  ? "Salvando…"
                  : edit
                    ? "Salvar correção auditada"
                    : "Confirmar registro"}
              </button>
              {edit && (
                <button
                  type="button"
                  className="outline"
                  onClick={() => {
                    setEdit(null);
                    request.current = "";
                  }}
                >
                  Cancelar edição
                </button>
              )}
            </form>
          </section>
          <section className="admin-panel">
            <h2>Contribuições</h2>
            <small>
              Use os filtros e a paginação abaixo para consultar todo o
              histórico.
            </small>
            {donations.length === 0 && <p>Nenhum registro encontrado.</p>}
            {donations.map((d) => (
              <article className="admin-record" key={d.id}>
                <strong>
                  {money(d.amount_cents)} · {d.status}
                </strong>
                <p>
                  {d.is_anonymous ? "Doador anônimo" : d.donor_public_name} ·{" "}
                  {new Date(d.received_at).toLocaleString("pt-BR")}
                </p>
                <p>Referência: {d.payment_reference || "não informada"}</p>
                <p>Observações: {d.admin_notes || "—"}</p>
                {d.status === "confirmed" && (
                  <div>
                    <button
                      className="outline"
                      disabled={pending}
                      onClick={() => {
                        setEdit(d);
                        request.current = "";
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Corrigir
                    </button>
                    <button
                      className="outline"
                      disabled={pending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Cancelar este registro? O original será preservado para auditoria.",
                          )
                        )
                          run(() => cancelDonation(d.id, d.version));
                      }}
                    >
                      Cancelar registro
                    </button>
                  </div>
                )}
              </article>
            ))}
          </section>
        </div>
      )}
      {tab === "Campanha e Pix" && (
        <section className="admin-panel">
          <h2>Configurações da campanha</h2>
          <form
            action={(form) => {
              try {
                run(() =>
                  saveCampaign({
                    contact_email: form.get("contact_email"),
                    beneficiary: form.get("beneficiary"),
                    summary: form.get("summary"),
                    story: form.get("story"),
                    message: form.get("message"),
                    expenses: form.get("expenses"),
                    photo_url: form.get("photo_url"),
                    gallery_urls: String(form.get("gallery_urls") || "")
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    publication_consent:
                      form.get("publication_consent") === "on",
                    goal_cents: cents(String(form.get("goal"))),
                    pix_key: form.get("pix_key"),
                    pix_name: form.get("pix_name"),
                    pix_city: form.get("pix_city"),
                    pix_enabled: form.get("pix_enabled") === "on",
                  }),
                );
              } catch (e) {
                setResult({ ok: false, message: (e as Error).message });
              }
            }}
          >
            <div className="admin-grid">
              <div>
                <label>
                  Contato público dos responsáveis (e-mail)
                  <input
                    name="contact_email"
                    type="email"
                    defaultValue={snapshot.campaign.contact_email}
                    maxLength={254}
                  />
                </label>
                {(["beneficiary", "summary", "photo_url"] as const).map((k) => (
                  <label key={k}>
                    {
                      {
                        beneficiary: "Nome do beneficiário",
                        summary: "Descrição breve",
                        photo_url:
                          "Fotografia principal (URL HTTPS autorizada)",
                      }[k]
                    }
                    <input
                      name={k}
                      defaultValue={snapshot.campaign[k]}
                      maxLength={
                        k === "summary" ? 500 : k === "beneficiary" ? 120 : 2048
                      }
                    />
                  </label>
                ))}
                <label>
                  Fotografias adicionais (URLs HTTPS, uma por linha, até 8)
                  <textarea
                    name="gallery_urls"
                    defaultValue={snapshot.campaign.gallery_urls.join("\n")}
                  />
                </label>
                {(["story", "message", "expenses"] as const).map((k) => (
                  <label key={k}>
                    {
                      {
                        story: "História autorizada",
                        message: "Mensagem da família / beneficiário",
                        expenses: "Destinação dos recursos e despesas",
                      }[k]
                    }
                    <textarea
                      rows={k === "story" ? 8 : 4}
                      name={k}
                      defaultValue={snapshot.campaign[k]}
                    />
                  </label>
                ))}
                <label>
                  <input
                    name="publication_consent"
                    type="checkbox"
                    defaultChecked={snapshot.campaign.publication_consent}
                  />{" "}
                  Tenho autorização para publicar estes dados, fotografias e
                  informações de saúde.
                </label>
              </div>
              <div>
                <label>
                  Meta (R$)
                  <input
                    name="goal"
                    required
                    defaultValue={(snapshot.campaign.goal_cents / 100).toFixed(
                      2,
                    )}
                    inputMode="decimal"
                  />
                </label>
                <p className="admin-warning">
                  Pix direto para o beneficiário. Confira os dados e teste uma
                  transferência de baixo valor antes de divulgar. Não há
                  integração bancária.
                </p>
                <label>
                  Chave Pix (CPF/CNPJ sem pontuação, telefone +55, e-mail ou
                  aleatória)
                  <input
                    name="pix_key"
                    defaultValue={snapshot.campaign.pix_key}
                    maxLength={77}
                  />
                </label>
                <label>
                  Titular da conta (até 25 caracteres)
                  <input
                    name="pix_name"
                    defaultValue={snapshot.campaign.pix_name}
                    maxLength={25}
                  />
                </label>
                <label>
                  Cidade do recebedor (até 15 caracteres)
                  <input
                    name="pix_city"
                    defaultValue={snapshot.campaign.pix_city}
                    maxLength={15}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="pix_enabled"
                    defaultChecked={snapshot.campaign.pix_enabled}
                  />{" "}
                  Publicar os dados Pix conferidos (inclusive a chave).
                </label>
                <p>
                  Instituição: Mercado Pago. A chave será pública quando o Pix
                  estiver habilitado.
                </p>
              </div>
            </div>
            <button disabled={pending} className="button">
              Salvar configurações
            </button>
          </form>
        </section>
      )}
      {tab === "Atualizações" && (
        <div className="admin-grid">
          <section className="admin-panel">
            <h2>Publicar comunicado</h2>
            <form
              action={(form) =>
                run(() =>
                  saveUpdate({
                    title: form.get("title"),
                    body: form.get("body"),
                    document_url: form.get("document_url"),
                    publication_consent: form.get("consent") === "on",
                  }),
                )
              }
            >
              <label>
                Título
                <input name="title" required minLength={3} maxLength={160} />
              </label>
              <label>
                Comunicado / prestação de contas
                <textarea
                  name="body"
                  required
                  rows={6}
                  minLength={3}
                  maxLength={6000}
                />
              </label>
              <label>
                Documento público (URL HTTPS, opcional)
                <input name="document_url" type="url" />
              </label>
              <p className="admin-warning">
                Remova CPF, dados bancários, endereços e informações médicas não
                autorizadas antes de publicar documentos.
              </p>
              <label>
                <input name="consent" type="checkbox" required /> Tenho
                autorização e revisei os dados sensíveis deste comunicado.
              </label>
              <button className="button" disabled={pending}>
                Publicar atualização
              </button>
            </form>
          </section>
          <section className="admin-panel">
            <h2>Comunicados publicados</h2>
            {snapshot.updates.map((u) => (
              <article className="admin-record" key={u.id}>
                <h3>{u.title}</h3>
                <p className="preserve">{u.body}</p>
                <button
                  className="outline"
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Retirar comunicado público? A operação ficará na auditoria.",
                      )
                    )
                      run(() => removeUpdate(u.id));
                  }}
                >
                  Retirar publicação
                </button>
              </article>
            ))}
          </section>
        </div>
      )}
      {tab === "Auditoria" && (
        <section className="admin-panel">
          <h2>Últimas 60 operações</h2>
          <p>
            Histórico financeiro preservado no banco. As versões originais e
            alteradas são retidas em audit_logs, com acesso exclusivo dos
            administradores.
          </p>
          {audit.map((a) => (
            <article className="admin-record" key={a.id}>
              <strong>
                {a.table_name} · {a.operation}
              </strong>
              <p>
                {new Date(a.created_at).toLocaleString("pt-BR")} ·
                Administrador: {a.actor}
              </p>
              <small>Registro: {a.record_id}</small>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
function localDate(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

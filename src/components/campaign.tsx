"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion, animate } from "motion/react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Copy,
  Heart,
  HeartHandshake,
  Leaf,
  LockKeyhole,
  ShieldCheck,
  Sprout,
  Users,
  WifiOff,
} from "lucide-react";
import QRCode from "qrcode";
import { browserDb } from "@/lib/supabase/browser";
import { cents, indicators, money, type Snapshot } from "@/lib/model";
import { pixPayload } from "@/lib/pix";
const date = (s: string) =>
  new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba" });
function AnimatedMoney({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const reduced = useReducedMotion();
  useEffect(() => {
    const controls = animate(previous.current, value, {
      duration: reduced ? 0 : 0.8,
      onUpdate: (n) => {
        if (ref.current) ref.current.textContent = money(Math.round(n));
      },
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  return <span ref={ref}>{money(value)}</span>;
}
export function Campaign({
  initial,
  transparency = false,
}: {
  initial: Snapshot;
  transparency?: boolean;
}) {
  const [data, setData] = useState(initial),
    [offline, setOffline] = useState(false),
    [notice, setNotice] = useState("");
  const last = useRef(initial);
  const requestVersion = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const version = ++requestVersion.current;
      try {
        const response = await fetch("/api/campaign", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const next: Snapshot = await response.json();
        if (!active || version !== requestVersion.current) return;
        const old = last.current;
        const added = next.donations.find(
          (d) => !old.donations.some((o) => o.id === d.id),
        );
        if (next.count > old.count && added)
          setNotice(
            `Uma nova contribuição de ${money(added.amount_cents)} foi confirmada. ❤️`,
          );
        last.current = next;
        setData(next);
        setOffline(false);
      } catch {
        if (active) setOffline(true);
      }
    };
    const db = browserDb();
    const channel = db
      ?.channel("public-campaign")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campaign_signal" },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setOffline(true);
      });
    const timer = setInterval(() => void refresh(), 30000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    void refresh();
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
      if (channel) void db?.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const c = data.campaign,
    stats = indicators(data.total_cents, c.goal_cents);
  const authorized = c.publication_consent;
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <HeartHandshake size={25} />
          </span>
          <span>
            corrente<span className="brand-sub">de esperança</span>
          </span>
        </Link>
        <nav aria-label="Principal">
          <Link href="/#historia">A história</Link>
          <Link href="/transparencia">Transparência</Link>
          <a href="#compartilhar">Compartilhe</a>
        </nav>
        <Link className="button small" href="/#doar">
          Quero ajudar <Heart size={16} />
        </Link>
      </header>
      <main id="conteudo">
        {offline && (
          <div className="connection" role="status">
            <WifiOff size={16} /> Não foi possível sincronizar. Exibindo os
            últimos dados disponíveis; tentaremos novamente.
          </div>
        )}
        {!transparency && (
          <section className="hero wrap">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="dot" /> UMA CORRENTE PELA VIDA
              </span>
              <h1>
                Juntos pela vida:
                <br />
                ajude nessa luta
                <br />
                contra o <em>câncer.</em>
              </h1>
              <p className="lead">
                Cada contribuição faz a diferença. Sua solidariedade pode ajudar
                a tornar esse tratamento possível.
              </p>
              <div className="hero-actions">
                <a href="#doar" className="button">
                  Quero ajudar agora <Heart size={19} />
                </a>
                <a className="text-link" href="#historia">
                  Conheça essa história <ArrowDown size={16} />
                </a>
              </div>
              <div className="hero-assurance">
                <ShieldCheck size={18} /> Pix direto para o beneficiário{" "}
                <span>•</span> Sem retenção pelo site
              </div>
            </div>
            <div className="hero-art">
              {authorized && c.photo_url ? (
                <Image
                  unoptimized
                  width={600}
                  height={600}
                  className="beneficiary-photo"
                  src={c.photo_url}
                  alt={
                    c.beneficiary
                      ? `Fotografia autorizada de ${c.beneficiary}`
                      : "Fotografia autorizada do beneficiário"
                  }
                />
              ) : (
                <div
                  className="hope-art"
                  role="img"
                  aria-label="Ilustração de folhas: esperança que cresce"
                >
                  <div className="art-orbit orbit-one" />
                  <div className="art-orbit orbit-two" />
                  <Sprout strokeWidth={0.8} />
                  <span>
                    O cuidado floresce
                    <br />
                    <strong>quando estamos juntos.</strong>
                  </span>
                </div>
              )}
              <div className="art-label">
                <span className="mini-icon">
                  <Heart size={19} />
                </span>
                <div>
                  <strong>
                    {authorized && c.beneficiary
                      ? c.beneficiary
                      : "Uma vida. Muitas mãos."}
                  </strong>
                  <small>
                    {authorized && c.summary
                      ? c.summary
                      : "Solidariedade que se transforma em esperança."}
                  </small>
                </div>
              </div>
              <span className="art-tag">
                <Leaf size={14} /> Cada gesto importa
              </span>
            </div>
          </section>
        )}
        <section
          className={`wrap progress-section ${transparency ? "standalone" : ""}`}
          aria-labelledby="progresso"
        >
          <div className="progress-card">
            <div className="progress-top">
              <div>
                <span className="eyebrow">
                  JUNTOS, MAIS PERTO DO TRATAMENTO
                </span>
                <h2 id="progresso">Cada contribuição nos aproxima da meta.</h2>
              </div>
              <span className="pill">
                <ShieldCheck size={15} /> Confirmação manual
              </span>
            </div>
            <div className="amount-row">
              <div>
                <span className="muted">Arrecadados até agora</span>
                <strong className="total">
                  <AnimatedMoney value={data.total_cents} />
                </strong>
              </div>
              <div className="goal">
                Nossa meta<strong>{money(c.goal_cents)}</strong>
              </div>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Progresso da arrecadação"
              aria-valuenow={Math.round(stats.fill)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${stats.percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% da meta`}
            >
              <motion.div
                initial={false}
                animate={{ width: `${stats.fill}%` }}
                transition={{ duration: reduced ? 0 : 0.8 }}
              />
            </div>
            <div className="progress-meta">
              <strong>
                {stats.percent.toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                })}
                % da meta alcançada
              </strong>
              <span>
                Faltam <b>{money(stats.remaining)}</b>
              </span>
            </div>
            <div className="progress-bottom">
              <span>
                <Users size={20} />
                <strong>{data.count}</strong> doações confirmadas
              </span>
              <small>
                Os valores são atualizados após a confirmação das doações.
              </small>
            </div>
            {!data.configured && (
              <p className="pending">
                Campanha em preparação. A conexão com os registros de
                arrecadação ainda não foi configurada.
              </p>
            )}
          </div>
        </section>
        {!transparency && (
          <>
            <div className="trust-strip wrap">
              <span>
                <LockKeyhole />
                Transferência pelo seu banco
              </span>
              <span>
                <HeartHandshake />
                Direto para quem precisa
              </span>
              <span>
                <ShieldCheck />
                Transparência em cada passo
              </span>
            </div>
            <section className="wrap story section" id="historia">
              <div className="section-heading">
                <span className="eyebrow">POR TRÁS DA CAMPANHA, UMA VIDA</span>
                <h2>
                  Conheça essa história<span className="green">.</span>
                </h2>
              </div>
              <div className="story-grid">
                <div className="story-quote">
                  <HeartHandshake size={45} strokeWidth={1} />
                  <h3>
                    Juntos, podemos transformar solidariedade em esperança.
                  </h3>
                  <p>
                    Não importa o valor.
                    <br />
                    Toda ajuda faz a diferença.
                  </p>
                </div>
                <div className="story-content">
                  <h3>
                    {authorized && c.beneficiary
                      ? `Uma corrente por ${c.beneficiary}`
                      : "Uma história que merece cuidado"}
                  </h3>
                  <p className="preserve">
                    {authorized && c.story
                      ? c.story
                      : "A história e as informações do beneficiário serão publicadas aqui após autorização. Enquanto isso, estamos preparando cada detalhe desta campanha com responsabilidade e respeito."}
                  </p>
                  {authorized && c.message && (
                    <blockquote>{c.message}</blockquote>
                  )}
                  {authorized && c.gallery_urls.length > 0 && (
                    <div className="gallery">
                      {c.gallery_urls.map((url, i) => (
                        <Image
                          unoptimized
                          width={110}
                          height={110}
                          key={url}
                          src={url}
                          alt={`Fotografia adicional autorizada ${i + 1}`}
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}
                  <a className="text-link" href="#doar">
                    Faça parte dessa corrente <ArrowUpRight size={17} />
                  </a>
                </div>
              </div>
            </section>
            <Pix campaign={c} />
          </>
        )}
        <section className="transparency section" id="transparencia">
          <div className="wrap">
            <div className="section-heading centered">
              <span className="eyebrow">CONFIANÇA QUE CONECTA</span>
              <h2>Transparência em cada contribuição</h2>
              <p>
                Você acompanha o caminho da nossa corrente de solidariedade.
              </p>
            </div>
            <div className="transparency-grid">
              <article className="white-card">
                <ShieldCheck className="green" size={28} />
                <h3>Seu apoio chega direto</h3>
                <p>
                  Esta campanha é independente. As doações são realizadas
                  diretamente para a conta Pix do beneficiário, sem retenção de
                  valores pela plataforma.
                </p>
                <small>
                  Eventuais tarifas da instituição financeira seguem as
                  condições do banco.
                </small>
              </article>
              <article className="white-card">
                <Leaf className="green" size={28} />
                <h3>Destinação dos recursos</h3>
                <p className="preserve">
                  {authorized && c.expenses
                    ? c.expenses
                    : "Recursos destinados a ajudar a custear o tratamento oncológico. O detalhamento das despesas será publicado pelos responsáveis."}
                </p>
                <small>
                  Última atualização:{" "}
                  {data.updated_at
                    ? date(data.updated_at)
                    : "aguardando primeiro registro"}
                </small>
              </article>
            </div>
            <div className="history-grid">
              <div>
                <h3 className="subheading">
                  Últimas contribuições <Heart size={18} />
                </h3>
                {data.donations.length ? (
                  data.donations.map((d) => (
                    <div className="donation-row" key={d.id}>
                      <span className="donor-icon">
                        <Heart size={16} />
                      </span>
                      <div>
                        <strong>{d.name}</strong>
                        <small>{date(d.received_at)}</small>
                      </div>
                      <b>{money(d.amount_cents)}</b>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    <Heart size={24} />
                    <p>
                      A corrente começa com um gesto.
                      <br />
                      Ainda não há doações confirmadas.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <h3 className="subheading">
                  Notícias da campanha <Sprout size={18} />
                </h3>
                {data.updates.length ? (
                  data.updates.map((u) => (
                    <article className="update" key={u.id}>
                      <small>{date(u.created_at)}</small>
                      <h4>{u.title}</h4>
                      <p className="preserve">{u.body}</p>
                      {u.document_url && (
                        <a
                          href={u.document_url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Ver documento público ↗
                        </a>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="empty">
                    <Sprout size={24} />
                    <p>
                      As atualizações e a prestação de contas
                      <br />
                      serão publicadas neste espaço.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
        <Share />
        <section className="closing wrap">
          <HeartHandshake size={30} />
          <p>
            Cada gesto de solidariedade
            <br />
            <strong>faz a esperança ir mais longe.</strong>
          </p>
        </section>
      </main>
      <footer className="site-footer wrap">
        <Link href="/" className="brand">
          <HeartHandshake size={22} /> corrente de esperança
        </Link>
        <p>Uma campanha independente. Uma corrente pela vida.</p>
        <div>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
          <Link href="/admin">Área administrativa</Link>
        </div>
      </footer>
      <Link className="mobile-donate button" href="/#doar">
        Quero ajudar agora <Heart size={18} />
      </Link>
      <div className="toast" role="status" aria-live="polite">
        {notice}
      </div>
    </>
  );
}
function Pix({ campaign: c }: { campaign: Snapshot["campaign"] }) {
  const [amount, setAmount] = useState("50"),
    [custom, setCustom] = useState(false),
    [qr, setQr] = useState<{ payload: string; url: string } | null>(null),
    [copied, setCopied] = useState(""),
    [copyError, setCopyError] = useState("");
  let payload = "",
    error = "";
  if (c.pix_enabled && c.pix_key) {
    try {
      payload = pixPayload(
        c.pix_key,
        c.pix_name,
        c.pix_city,
        amount ? cents(amount) : undefined,
      );
    } catch (e) {
      error = (e as Error).message;
    }
  }
  useEffect(() => {
    let active = true;
    if (payload)
      QRCode.toDataURL(payload, {
        width: 300,
        margin: 4,
        errorCorrectionLevel: "M",
      })
        .then((url) => {
          if (active) setQr({ payload, url });
        })
        .catch(() => {
          if (active) setQr(null);
        });
    return () => {
      active = false;
    };
  }, [payload]);
  async function copy(value: string, type: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      setCopyError("");
      setTimeout(() => setCopied(""), 2500);
    } catch {
      setCopyError(
        "Não foi possível copiar automaticamente. Selecione e copie o texto abaixo.",
      );
    }
  }
  return (
    <section className="section wrap pix-section" id="doar">
      <div className="pix-copy">
        <span className="eyebrow">
          UM GESTO SIMPLES. UM GRANDE SIGNIFICADO.
        </span>
        <h2>
          Sua solidariedade
          <br />
          pode fazer a <em>diferença.</em>
        </h2>
        <p>
          Escolha um valor e faça seu Pix pelo aplicativo do seu banco. A
          contribuição vai diretamente para a conta do beneficiário.
        </p>
        <ol className="steps">
          <li>
            <span>01</span>Escolha o valor da sua contribuição.
          </li>
          <li>
            <span>02</span>Leia o QR Code ou copie o código Pix.
          </li>
          <li>
            <span>03</span>Confira o titular no seu banco e confirme.
          </li>
        </ol>
        <div className="note">
          <ShieldCheck size={22} />
          <p>
            Não pedimos cadastro nem comprovante. A doação só entra na
            arrecadação após conferência no extrato.
          </p>
        </div>
      </div>
      <div className="pix-card">
        <span className="pill">
          <Heart size={14} /> FAÇA PARTE DESSA CORRENTE
        </span>
        <h3>Quanto você gostaria de doar?</h3>
        <div className="amount-options">
          {["10", "20", "50", "100", "200"].map((v) => (
            <button
              key={v}
              className={!custom && amount === v ? "selected" : ""}
              onClick={() => {
                setCustom(false);
                setAmount(v);
              }}
            >
              {money(Number(v) * 100)}
            </button>
          ))}
          <button
            className={custom ? "selected" : ""}
            onClick={() => {
              setCustom(true);
              setAmount("");
            }}
          >
            Outro valor
          </button>
        </div>
        {custom && (
          <label>
            Valor em reais
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex.: 35,00"
            />
          </label>
        )}
        {c.pix_enabled && c.pix_key ? (
          <>
            <p className="recipient">
              <strong>{c.pix_name}</strong>
              <span>
                Mercado Pago · {c.beneficiary || "Beneficiário da campanha"}
              </span>
            </p>
            {error ? (
              <p role="alert" className="error">
                {error}
              </p>
            ) : (
              <>
                {qr?.payload === payload ? (
                  <Image
                    unoptimized
                    className="qr"
                    src={qr.url}
                    width={240}
                    height={240}
                    alt="QR Code Pix para o titular indicado"
                  />
                ) : (
                  <p>Gerando QR Code…</p>
                )}
                <button
                  className="button full"
                  onClick={() => void copy(payload, "payload")}
                >
                  {copied === "payload" ? (
                    <Check size={18} />
                  ) : (
                    <Copy size={18} />
                  )}{" "}
                  {copied === "payload"
                    ? "Código copiado"
                    : "Copiar Pix Copia e Cola"}
                </button>
                <label className="copy-label">
                  Pix Copia e Cola
                  <textarea readOnly value={payload} rows={2} />
                </label>
              </>
            )}
            <div className="pix-key">
              <span>
                Chave Pix<strong>{c.pix_key}</strong>
              </span>
              <button
                aria-label="Copiar chave Pix"
                onClick={() => void copy(c.pix_key, "key")}
              >
                {copied === "key" ? <Check /> : <Copy />}
              </button>
            </div>
            <p className="error" role="status">
              {copyError}
            </p>
          </>
        ) : (
          <div className="pix-pending">
            <LockKeyhole size={32} />
            <h4>Pix em preparação</h4>
            <p>
              Os dados de recebimento ainda não foram configurados. Volte em
              breve para contribuir com segurança.
            </p>
          </div>
        )}
        <small className="pix-disclaimer">
          Selecionar um valor não confirma uma doação.
          <br />
          Confira sempre o recebedor antes de transferir.
        </small>
      </div>
    </section>
  );
}
function Share() {
  const [status, setStatus] = useState("");
  const text =
    "❤️ Ajude nessa corrente de solidariedade! Estamos arrecadando R$ 100 mil para ajudar a custear um tratamento contra o câncer. Qualquer contribuição faz a diferença. Se não puder doar, compartilhe!";
  function url() {
    return new URL("/", window.location.href).href;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setStatus(
        "Link copiado! Você também pode colá-lo na bio ou nos stories do Instagram.",
      );
    } catch {
      setStatus(`Copie este endereço: ${url()}`);
    }
  }
  return (
    <section className="share-section wrap section" id="compartilhar">
      <span className="eyebrow">SOLIDARIEDADE TAMBÉM SE ESPALHA</span>
      <h2>Você também pode ajudar compartilhando</h2>
      <p>Se não puder doar, compartilhar também é uma forma de ajudar.</p>
      <div className="share-buttons">
        <button
          className="button"
          onClick={() =>
            window.open(
              `https://wa.me/?text=${encodeURIComponent(text + " " + url())}`,
              "_blank",
              "noopener,noreferrer",
            )
          }
        >
          Compartilhar no WhatsApp <ArrowUpRight size={16} />
        </button>
        <button
          className="outline"
          onClick={() =>
            window.open(
              `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`,
              "_blank",
              "noopener,noreferrer",
            )
          }
        >
          Facebook
        </button>
        <button
          className="outline"
          onClick={() => {
            if (navigator.share)
              navigator
                .share({ title: "Corrente de esperança", text, url: url() })
                .catch(() => setStatus("Compartilhamento cancelado."));
            else void copy();
          }}
        >
          Mais opções
        </button>
        <button className="outline" onClick={() => void copy()}>
          <Copy size={16} /> Copiar link
        </button>
      </div>
      <p role="status">{status}</p>
    </section>
  );
}

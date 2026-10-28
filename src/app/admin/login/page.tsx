"use client";
import { useActionState } from "react";
import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { login } from "../actions";
export default function Login() {
  const [state, action, pending] = useActionState(login, {
    ok: false,
    message: "",
  });
  return (
    <main id="conteudo" className="login admin-panel">
      <Link href="/">← Voltar para a campanha</Link>
      <HeartHandshake className="green" size={35} />
      <h1>Cuide dessa corrente.</h1>
      <p>Acesso exclusivo para administradores autorizados.</p>
      <form action={action}>
        <label>
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            maxLength={256}
          />
        </label>
        <button className="button full" disabled={pending}>
          {pending ? "Entrando…" : "Entrar com segurança"}
        </button>
        <p role="status" className="error">
          {state.message}
        </p>
      </form>
      <small>
        Não há cadastro público. Solicite acesso ao responsável pela campanha.
      </small>
    </main>
  );
}

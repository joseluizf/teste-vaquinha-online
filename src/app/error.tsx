"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="conteudo" className="legal">
      <h1>Vamos tentar novamente?</h1>
      <p>
        Não foi possível consultar a campanha. Nenhum valor estimado será
        exibido.
      </p>
      <button className="button" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}

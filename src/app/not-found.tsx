import Link from "next/link";
export default function NotFound() {
  return (
    <main id="conteudo" className="legal">
      <h1>Página não encontrada</h1>
      <Link href="/">Voltar para a campanha</Link>
    </main>
  );
}

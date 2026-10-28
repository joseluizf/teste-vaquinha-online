import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: {
    default: "Corrente de esperança | Juntos pela vida",
    template: "%s | Corrente de esperança",
  },
  description:
    "Juntos pela vida: ajude nessa luta contra o câncer. Uma campanha independente, com Pix direto e transparência em cada contribuição.",
  openGraph: {
    locale: "pt_BR",
    type: "website",
    title: "Juntos pela vida. Faça parte dessa corrente.",
    description:
      "Cada contribuição faz a diferença. Ajude a tornar esse tratamento possível.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}

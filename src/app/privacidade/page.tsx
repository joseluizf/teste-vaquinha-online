import { Contact } from "@/components/contact";
export const dynamic = "force-dynamic";
import Link from "next/link";
export const metadata = { title: "Privacidade" };
export default function Page() {
  return (
    <main id="conteudo" className="legal">
      <Link href="/">← Voltar à campanha</Link>
      <h1>Política de privacidade</h1>
      <p>
        Esta plataforma independente divulga uma campanha solidária e registra
        doações conferidas pelos responsáveis. Não exige cadastro de doadores
        nem recebe pagamentos.
      </p>
      <h2>Dados mínimos, cuidado permanente</h2>
      <p>
        Valores e datas são usados para a prestação de contas. O anonimato é o
        padrão. Nomes só são publicados mediante autorização registrada; CPF,
        referências bancárias, notas administrativas e comprovantes privados não
        são exibidos.
      </p>
      <h2>História e imagens</h2>
      <p>
        Fotografias e informações de saúde exigem autorização do beneficiário.
        Os responsáveis devem retirar ou corrigir conteúdo quando a autorização
        for revogada e limitar documentos aos dados necessários.
      </p>
      <h2>Serviços e armazenamento</h2>
      <p>
        Supabase armazena os registros e autentica administradores; Vercel
        hospeda a aplicação. Esses fornecedores podem processar registros
        técnicos de conexão. Links externos de fotografias ou documentos podem
        transmitir o endereço IP ao respectivo provedor. Prefira arquivos
        armazenados em infraestrutura controlada pela campanha.
      </p>
      <p>
        Cookies são utilizados apenas para autenticação administrativa. Não
        incluímos publicidade ou rastreadores de marketing. Compartilhamentos
        abrem plataformas externas sujeitas às próprias políticas.
      </p>
      <h2>Direitos e retenção</h2>
      <p>
        Você pode solicitar informação, correção ou retirada de dados públicos
        aos responsáveis pela campanha. Registros financeiros e de auditoria são
        mantidos pelo período necessário para prestação de contas e obrigações
        aplicáveis, com acesso restrito. O responsável deve definir prazos de
        retenção e disponibilizar um canal de contato antes da divulgação
        pública.
      </p>
      <p>
        O uso do Pix depende das condições e da política de privacidade da
        instituição financeira escolhida.
      </p>
      <Contact />
    </main>
  );
}

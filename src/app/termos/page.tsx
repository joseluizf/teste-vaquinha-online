import { Contact } from "@/components/contact";
export const dynamic = "force-dynamic";
import Link from "next/link";
export const metadata = { title: "Termos da campanha" };
export default function Page() {
  return (
    <main id="conteudo" className="legal">
      <Link href="/">← Voltar à campanha</Link>
      <h1>Termos da campanha</h1>
      <h2>Finalidade</h2>
      <p>
        Esta campanha independente busca apoio para custear tratamento
        oncológico. Os responsáveis devem manter a história, a destinação dos
        recursos e as atualizações verdadeiras e autorizadas.
      </p>
      <h2>Doações diretas</h2>
      <p>
        O dinheiro é transferido diretamente para a conta Pix do beneficiário no
        Mercado Pago, pelo aplicativo bancário do doador. A plataforma não
        movimenta, retém ou cobra taxas sobre as doações. Eventuais tarifas
        bancárias dependem da instituição.
      </p>
      <p>
        Confira o nome do recebedor antes de transferir. Gerar um QR Code,
        selecionar um valor ou copiar uma chave não confirma pagamento.
        Reembolsos e questões sobre transferências devem ser tratados com o
        recebedor e a instituição financeira.
      </p>
      <h2>Indicadores e confirmação</h2>
      <p>
        Somente recebimentos conferidos no extrato e registrados por
        administradores autorizados compõem os indicadores. Pode existir
        intervalo entre a transferência e a atualização pública. Registros
        incorretos podem ser corrigidos ou cancelados com histórico de
        auditoria.
      </p>
      <h2>Responsabilidade e respeito</h2>
      <p>
        A campanha não garante resultados médicos. Contribuir é voluntário. A
        meta e a prestação de contas podem ser atualizadas pelos responsáveis;
        alcançar a meta não impede novos apoios, que devem respeitar a
        finalidade informada.
      </p>
      <p>
        O responsável deve informar seu canal de contato e revisar estes termos
        e a política de privacidade antes da publicação.
      </p>
      <Contact />
    </main>
  );
}

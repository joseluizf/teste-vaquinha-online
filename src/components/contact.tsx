import { getSnapshot } from "@/lib/data";
export async function Contact() {
  const { campaign } = await getSnapshot();
  return (
    <section>
      <h2>Fale com os responsáveis</h2>
      {campaign.contact_email ? (
        <p>
          Solicitações sobre a campanha e seus dados:{" "}
          <a href={`mailto:${campaign.contact_email}`}>
            {campaign.contact_email}
          </a>
          .
        </p>
      ) : (
        <p>
          O canal de contato ainda será informado pelos responsáveis antes da
          divulgação da campanha.
        </p>
      )}
    </section>
  );
}

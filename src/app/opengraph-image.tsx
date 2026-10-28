import { ImageResponse } from "next/og";
export const alt = "Corrente de esperança. Juntos pela vida.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#edf5ef",
        padding: 85,
        color: "#173f32",
        justifyContent: "center",
      }}
    >
      <div style={{ fontSize: 28, letterSpacing: 5, color: "#26745c" }}>
        CORRENTE DE ESPERANÇA
      </div>
      <div style={{ fontSize: 86, fontWeight: 700, marginTop: 30 }}>
        Juntos pela vida.
      </div>
      <div style={{ fontSize: 38, marginTop: 25 }}>
        Cada contribuição faz a diferença.
      </div>
      <div style={{ fontSize: 25, marginTop: 65 }}>
        Pix direto · Confirmação manual · Transparência
      </div>
    </div>,
    size,
  );
}

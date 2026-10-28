import { test, expect } from "@playwright/test";
for (const width of [390, 768, 1440])
  test(`campanha funcional e sem rolagem horizontal em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Juntos pela vida",
    );
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await expect(page.getByText("Pix em preparação")).toBeVisible();
    await page.getByRole("button", { name: "R$ 20,00", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "R$ 20,00", exact: true }),
    ).toHaveClass("selected");
    await page.getByRole("button", { name: "Outro valor" }).click();
    await page.getByPlaceholder("Ex.: 35,00").fill("35,00");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/campanha-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
test("rotas públicas, autenticação pendente e exportação protegida", async ({
  page,
  request,
}) => {
  for (const path of [
    "/transparencia",
    "/privacidade",
    "/termos",
    "/admin/login",
    "/admin",
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
  }
  await expect(
    page.getByRole("heading", { name: "Conecte o Supabase" }),
  ).toBeVisible();
  expect((await request.get("/admin/export")).status()).toBe(401);
  const data = await (await request.get("/api/campaign")).json();
  expect(data.total_cents).toBe(0);
  expect(data.count).toBe(0);
  expect(data.configured).toBe(false);
  const og = await request.get("/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
});

test("Pix configurado e sincronização de contribuição (dados apenas de teste)", async ({
  page,
}) => {
  const { emptySnapshot } = await import("../../src/lib/model");
  const { pixPayload } = await import("../../src/lib/pix");
  const fixture = {
    ...emptySnapshot,
    configured: true,
    total_cents: 5000,
    count: 1,
    campaign: {
      ...emptySnapshot.campaign,
      pix_enabled: true,
      pix_key: "test@example.com",
      pix_name: "RECEBEDOR TESTE",
      pix_city: "CUIABA",
    },
    donations: [
      {
        id: crypto.randomUUID(),
        amount_cents: 5000,
        received_at: new Date().toISOString(),
        name: "Doador anônimo",
      },
    ],
  };
  await page.route("**/api/campaign", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("status").filter({ hasText: "Uma nova contribuição de" }),
  ).toContainText("50,00");
  const image = page.getByRole("img", {
    name: "QR Code Pix para o titular indicado",
  });
  const expected = pixPayload(
    "test@example.com",
    "RECEBEDOR TESTE",
    "CUIABA",
    5000,
  );
  await expect(
    page.getByRole("textbox", { name: "Pix Copia e Cola", exact: true }),
  ).toHaveValue(expected);
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);
  const previous = await image.getAttribute("src");
  await page.getByRole("button", { name: "R$ 20,00", exact: true }).click();
  const changed = pixPayload(
    "test@example.com",
    "RECEBEDOR TESTE",
    "CUIABA",
    2000,
  );
  await expect(
    page.getByRole("textbox", { name: "Pix Copia e Cola", exact: true }),
  ).toHaveValue(changed);
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(image).not.toHaveAttribute("src", previous!);
});

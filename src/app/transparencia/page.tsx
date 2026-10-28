import { Campaign } from "@/components/campaign";
import { getSnapshot } from "@/lib/data";
export const dynamic = "force-dynamic";
export const metadata = { title: "Transparência" };
export default async function Page() {
  return <Campaign initial={await getSnapshot()} transparency />;
}

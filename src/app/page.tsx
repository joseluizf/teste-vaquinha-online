import { Campaign } from "@/components/campaign";
import { getSnapshot } from "@/lib/data";
export const dynamic = "force-dynamic";
export default async function Home() {
  return <Campaign initial={await getSnapshot()} />;
}

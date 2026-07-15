import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { ReciteView } from "@/components/recite/recite-view";

export const dynamic = "force-dynamic";

export default async function RecitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [problem] = await db
    .select()
    .from(problems)
    .where(eq(problems.id, id))
    .limit(1);

  if (!problem) {
    notFound();
  }

  return <ReciteView problem={problem} />;
}

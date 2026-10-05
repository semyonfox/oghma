import ActionConfirmation from "@/components/chat/action-confirmation";
import { notFound } from "next/navigation";
import { isValidUUID } from "@/lib/utils/uuid";

export default async function ReviewAction({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUUID(id)) notFound();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <ActionConfirmation actionId={id} />
    </main>
  );
}

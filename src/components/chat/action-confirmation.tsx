"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

const actionSchema = z.object({
  id: z.string().uuid(),
  tool_name: z.string(),
  input: z.unknown(),
  status: z.string(),
  target_origin: z.string().nullable().optional(),
});

export default function ActionConfirmation({ actionId }: { actionId: string }) {
  const [action, setAction] = useState<z.infer<typeof actionSchema> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/chat/actions/${actionId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("This action is unavailable or expired.");
        const value = actionSchema.parse(await response.json());
        if (active) setAction(value);
      })
      .catch((error: unknown) => {
        if (active)
          setError(
            error instanceof Error ? error.message : "Could not load action.",
          );
      });
    return () => {
      active = false;
    };
  }, [actionId]);
  const currentAction = action?.id === actionId ? action : null;
  async function decide(decision: "approve" | "reject") {
    if (!currentAction || currentAction.status !== "pending") return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/chat/actions/${actionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok)
        throw new Error(
          "Action could not finish. Check the destination before requesting it again.",
        );
      const value = z
        .object({ status: z.string() })
        .parse(await response.json());
      setAction((current) =>
        current?.id === actionId
          ? { ...current, status: value.status }
          : current,
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not finish action.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="my-3 space-y-3 rounded-radius-lg border border-border-subtle bg-surface p-4">
      <p className="font-semibold">Review proposed action</p>
      {currentAction && (
        <>
          <p>{currentAction.tool_name}</p>
          {currentAction.target_origin && (
            <p>Canvas destination: {currentAction.target_origin}</p>
          )}
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm">
            {JSON.stringify(currentAction.input, null, 2)}
          </pre>
          {currentAction.status === "pending" ? (
            <>
              <p>
                This action has not run. Check the destination and every value
                before approving.
              </p>
              <div className="flex gap-3">
                <button
                  className="min-h-11 rounded-radius-md bg-primary-600 px-4 text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void decide("approve")}
                >
                  Approve action
                </button>
                <button
                  className="min-h-11 rounded-radius-md border border-border-subtle px-4 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void decide("reject")}
                >
                  Reject
                </button>
              </div>
            </>
          ) : (
            <p role="status">Action {currentAction.status}</p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

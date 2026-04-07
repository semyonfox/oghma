export type CelebrationType =
  | "default"
  | "assignment"
  | "pomodoro"
  | "quiz_perfect";

export async function triggerCelebration(
  type: CelebrationType = "default",
): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const { default: confetti } = await import("canvas-confetti");

    if (type === "quiz_perfect") {
      confetti({
        particleCount: 120,
        spread: 78,
        origin: { y: 0.55 },
      });
      confetti({
        particleCount: 90,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.7 },
      });
      confetti({
        particleCount: 90,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.7 },
      });
      return;
    }

    if (type === "pomodoro") {
      confetti({
        particleCount: 80,
        spread: 65,
        origin: { y: 0.65 },
      });
      return;
    }

    if (type === "assignment") {
      confetti({
        particleCount: 70,
        spread: 58,
        origin: { y: 0.6 },
      });
      return;
    }

    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.55 },
    });
  } catch {
    // no-op: celebration should never break user flow
  }
}

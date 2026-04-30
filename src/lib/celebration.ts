export type CelebrationType =
  | "default"
  | "assignment"
  | "pomodoro"
  | "quiz_perfect"
  | "quiz_good"
  | "streak"
  | "streak_milestone";

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

    if (type === "quiz_good") {
      confetti({
        particleCount: 60,
        spread: 55,
        origin: { y: 0.6 },
      });
      return;
    }

    if (type === "streak") {
      confetti({
        particleCount: 50,
        spread: 50,
        origin: { y: 0.5 },
        colors: ["#f59e0b", "#fbbf24", "#fcd34d", "#fde68a"],
      });
      return;
    }

    if (type === "streak_milestone") {
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.5 },
        colors: ["#f59e0b", "#fbbf24", "#f97316", "#ef4444"],
      });
      await new Promise((r) => setTimeout(r, 200));
      confetti({
        particleCount: 80,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.6 },
        colors: ["#f59e0b", "#fbbf24"],
      });
      confetti({
        particleCount: 80,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.6 },
        colors: ["#f59e0b", "#fbbf24"],
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

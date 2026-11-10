// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key, activeLocale: "en" }),
}));
vi.mock("@/components/calendar/day-agenda", () => ({ default: () => <p>Agenda</p> }));

import MobileSheet from "@/components/navigation/mobile-sheet";
import MobileDrawer from "@/components/navigation/mobile-drawer";
import NewTaskModal from "@/components/assignments/new-task-modal";
import DayAgendaDialog from "@/components/calendar/day-agenda-dialog";
import StudyBlockDialog from "@/components/calendar/study-block-dialog";
import { CourseVisibilityDialog } from "@/components/course-visibility/course-visibility-manager";

const swipe = (title: HTMLElement, dx: number, dy: number) => {
  const at = (x: number, y: number) => ({
    touches: [{ identifier: 0, clientX: x, clientY: y }],
    changedTouches: [{ identifier: 0, clientX: x, clientY: y }],
    cancelable: true,
  });
  fireEvent.touchStart(title, at(150, 150));
  fireEvent.touchMove(title, at(150 + dx, 150 + dy));
  fireEvent.touchEnd(title, { ...at(150 + dx, 150 + dy), touches: [] });
};

// every panel that spreads useSwipeDismiss should close on an outward drag from its title
const panels: Array<[string, (onClose: () => void) => ReactElement, number, number]> = [
  ["mobile sheet", (onClose) => <MobileSheet open onClose={onClose} title="More"><p>Body</p></MobileSheet>, 0, 90],
  // phones get drawers as bottom sheets, so they close downwards like a sheet
  ["left drawer", (onClose) => <MobileDrawer open onClose={onClose} title="History"><p>Body</p></MobileDrawer>, 0, 90],
  ["right drawer", (onClose) => <MobileDrawer open side="right" onClose={onClose} title="Outline"><p>Body</p></MobileDrawer>, 0, 90],
  ["new task modal", (onClose) => <NewTaskModal open onClose={onClose} courses={[]} />, 0, 90],
  ["day agenda", (onClose) => <DayAgendaDialog open onClose={onClose} dateKey="2026-09-23" onAddTask={vi.fn()} onRetry={vi.fn()} />, 0, 90],
  ["study block", (onClose) => <StudyBlockDialog open onClose={onClose} initialDate="2026-09-23" />, 0, 90],
  ["course visibility", (onClose) => <CourseVisibilityDialog open onClose={onClose} items={[]} onToggleCourse={vi.fn()} />, 0, 90],
];

const setWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.matchMedia = (query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      matches: width >= min,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  };
};

beforeEach(() => setWidth(390));
afterEach(cleanup);

describe("swipe-to-dismiss wiring", () => {
  it.each(panels)("closes the %s", (_name, renderPanel, dx, dy) => {
    const close = vi.fn();
    render(renderPanel(close));
    const [title] = within(screen.getByRole("dialog")).getAllByRole("heading");
    swipe(title, dx, dy);
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ["left", -90],
    ["right", 90],
  ] as const)("keeps the %s side drawer swiping sideways on tablets", (side, dx) => {
    setWidth(800);
    const close = vi.fn();
    render(<MobileDrawer open side={side} onClose={close} title="History"><p>Body</p></MobileDrawer>);
    const [title] = within(screen.getByRole("dialog")).getAllByRole("heading");
    swipe(title, 0, 90);
    expect(close).not.toHaveBeenCalled();
    swipe(title, dx, 0);
    expect(close).toHaveBeenCalledOnce();
  });
});

import { getTomorrow, getYesterday, type ISODate } from "@/lib/dates";

const SWIPE_COMMIT_RATIO = 0.2;
const SWIPE_COMMIT_MIN_PX = 48;

export type SwipeDirection = "previous" | "next";

/**
 * Decides whether a released drag committed to a day change. Dragging
 * content to the left (negative deltaX) pulls the next day in from the
 * right, matching a calendar/carousel swipe; dragging right (positive
 * deltaX) pulls the previous day in from the left. Below the threshold the
 * caller should spring back in place.
 */
export function resolveSwipeDirection(
  deltaX: number,
  containerWidth: number,
): SwipeDirection | null {
  const threshold = Math.max(
    SWIPE_COMMIT_MIN_PX,
    containerWidth * SWIPE_COMMIT_RATIO,
  );

  if (deltaX <= -threshold) {
    return "next";
  }
  if (deltaX >= threshold) {
    return "previous";
  }
  return null;
}

/**
 * Same left/right mapping as resolveSwipeDirection, but with no distance
 * threshold -- used mid-drag to tell whether the direction the finger is
 * currently moving in is blocked at all, so a boundary can resist the drag
 * instead of just springing back after release.
 */
export function directionForSign(deltaX: number): SwipeDirection | null {
  if (deltaX < 0) {
    return "next";
  }
  if (deltaX > 0) {
    return "previous";
  }
  return null;
}

/**
 * The date a committed swipe would land on, or null if that would cross
 * the viewable range -- before the member's first scored day, or after
 * their current local "today".
 */
export function nextSwipeDate(
  currentDate: ISODate,
  direction: SwipeDirection,
  firstViewableDate: ISODate,
  lastViewableDate: ISODate,
): ISODate | null {
  const candidate =
    direction === "previous"
      ? getYesterday(currentDate)
      : getTomorrow(currentDate);

  if (candidate < firstViewableDate || candidate > lastViewableDate) {
    return null;
  }

  return candidate;
}

import { getTomorrow, getYesterday, type ISODate } from "@/lib/dates";

const SWIPE_COMMIT_RATIO = 0.2;
const SWIPE_COMMIT_MIN_PX = 48;

export type SwipeDirection = "previous" | "next";

/**
 * Decides whether a released drag committed to a day change. Negative
 * (leftward) crosses to the previous day; positive (rightward) crosses to
 * the next one. Below the threshold the caller should spring back in place.
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
    return "previous";
  }
  if (deltaX >= threshold) {
    return "next";
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

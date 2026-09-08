export {
  asDayTrackingClient,
  firstRpcRow,
  type CalendarCellRow,
  type DayMutationRow,
  type DayQueryError,
  type DayQueryResult,
  type DayRollupRow,
  type DayTrackingClient,
  type DailyBoardScoreRow,
  type GoalStateRow,
  type WaterContainerRow,
} from "./database";
export { DayApiError, requestDayApi, withOperationId } from "./client";
export { createContainerMutationService } from "./containers";
export {
  dayTrackingInvalidationContract,
  invalidateContainerTracking,
  invalidateDayTracking,
} from "./invalidation";
export { createDayTrackingMutationService } from "./mutations";
export {
  amountDeltaTo,
  applyOptimisticAmount,
  applyOptimisticGoalDone,
  resolveAmountFill,
  withGoalState,
  type AmountFillResolution,
} from "./optimistic";
export {
  createDayTrackingReadService,
  mapCalendarCellRow,
  mapDayRollupRow,
  mapDailyBoardDto,
  mapDailyBoardScoreRow,
} from "./rollup-adapter";
export { createDayTrackingServices } from "./server";
export {
  containerPatchSchema,
  dayAmountInputSchema,
  dayContainerInputSchema,
  dayEntryInputSchema,
  goalDoneToggleInputSchema,
  normalizeDayAmount,
  parseGoalDoneToggleInput,
  parseGoalIdPathSegment,
  parseAndNormalizeDayEntry,
  parseAndResolveGoalDoneToggle,
  parseContainerCreateInput,
  parseContainerUpdateInput,
  parseDayEntryInput,
  readJsonBody,
  resolveClientOperationId,
} from "./validation";
export type * from "./types";

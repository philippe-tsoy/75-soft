import { HttpError } from "@/lib/http";

import type { ContainerDTO } from "@/lib/types";

import type {
  DayQueryError,
  DayTrackingClient,
  WaterContainerRow,
} from "./database";
import type {
  ContainerCreateInput,
  ContainerMutationService,
  ContainerUpdateInput,
} from "./types";

const CONTAINER_COLUMNS =
  "id, owner_id, label, volume_ml, sort_order, created_at, updated_at, deleted_at";

function throwContainerQueryError(error: DayQueryError | null): void {
  if (!error) {
    return;
  }

  throw new HttpError(500, "INTERNAL_ERROR", "Unable to load water containers");
}

function mapContainer(row: WaterContainerRow): ContainerDTO {
  return {
    id: row.id,
    label: row.label,
    volumeMl: row.volume_ml,
    sortOrder: row.sort_order,
  };
}

function requireContainer(row: WaterContainerRow | null): WaterContainerRow {
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Water container was not found");
  }

  return row;
}

function isSortOrderConflict(error: DayQueryError | null): boolean {
  return error?.code === "23505";
}

const MAX_SORT_ORDER_ATTEMPTS = 5;

export function createContainerMutationService(
  db: DayTrackingClient,
): ContainerMutationService {
  return {
    async listContainers(userId) {
      const result = await db
        .from("water_containers")
        .select(CONTAINER_COLUMNS)
        .eq("owner_id", userId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      throwContainerQueryError(result.error);
      return (result.data ?? []).map(mapContainer);
    },

    async createContainer(userId, input: ContainerCreateInput) {
      // Two concurrent creates can both read the same max(sort_order) before
      // either insert commits; the unique index below turns that into a
      // conflict we retry with a freshly recomputed value instead of a
      // silent duplicate ordering.
      for (let attempt = 0; attempt < MAX_SORT_ORDER_ATTEMPTS; attempt += 1) {
        const existing = await this.listContainers(userId);
        const sortOrder =
          existing.reduce(
            (highest, container) => Math.max(highest, container.sortOrder),
            -1,
          ) + 1;
        const result = await db
          .from("water_containers")
          .insert({
            owner_id: userId,
            label: input.label.trim(),
            volume_ml: input.volumeMl,
            sort_order: sortOrder,
          })
          .select(CONTAINER_COLUMNS)
          .single();

        if (isSortOrderConflict(result.error)) {
          continue;
        }

        throwContainerQueryError(result.error);
        return mapContainer(requireContainer(result.data));
      }

      throw new HttpError(
        409,
        "CONFLICT",
        "Unable to place the new container after repeated conflicts",
      );
    },

    async updateContainer(userId, containerId, input: ContainerUpdateInput) {
      const values: Record<string, unknown> = {};
      if (input.label !== undefined) {
        values.label = input.label.trim();
      }
      if (input.volumeMl !== undefined) {
        values.volume_ml = input.volumeMl;
      }
      if (input.sortOrder !== undefined) {
        values.sort_order = input.sortOrder;
      }

      const result = await db
        .from("water_containers")
        .update(values)
        .eq("id", containerId)
        .eq("owner_id", userId)
        .is("deleted_at", null)
        .select(CONTAINER_COLUMNS)
        .maybeSingle();

      throwContainerQueryError(result.error);
      return mapContainer(requireContainer(result.data));
    },

    async deleteContainer(userId, containerId) {
      const existing = await db
        .from("water_containers")
        .select("id")
        .eq("id", containerId)
        .eq("owner_id", userId)
        .is("deleted_at", null)
        .maybeSingle();

      throwContainerQueryError(existing.error);
      requireContainer(existing.data as WaterContainerRow | null);

      const result = await db
        .from("water_containers")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", containerId)
        .eq("owner_id", userId)
        .is("deleted_at", null);

      throwContainerQueryError(result.error);
    },
  };
}

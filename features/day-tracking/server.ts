import { createSupabaseServerClient } from "@/lib/supabase/server";

import { asDayTrackingClient } from "./database";
import { createContainerMutationService } from "./containers";
import { createDayTrackingMutationService } from "./mutations";
import { createDayTrackingReadService } from "./rollup-adapter";

export async function createDayTrackingServices() {
  const supabase = await createSupabaseServerClient();
  const db = asDayTrackingClient(supabase);

  return {
    db,
    containers: createContainerMutationService(db),
    mutations: createDayTrackingMutationService(db),
    reads: createDayTrackingReadService(db),
  };
}

import { z } from "zod";

import { postGoalInputSchema } from "@/lib/validation";

export type PostGoalInput = z.infer<typeof postGoalInputSchema>[number];

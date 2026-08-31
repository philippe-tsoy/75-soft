import { getAccessContext } from "@/lib/auth/access";

import {
  GroupStrip,
  GroupStripError,
  GroupStripUnauthorized,
} from "@/components/group-strip/group-strip";
import { getGroupStripEntries } from "@/features/board/database";

export async function TodayGroupStrip() {
  const access = await getAccessContext();

  if (!access) {
    return <GroupStripUnauthorized />;
  }

  let entries;
  try {
    entries = await getGroupStripEntries(access.user.id);
  } catch {
    return <GroupStripError />;
  }

  return <GroupStrip entries={entries} />;
}

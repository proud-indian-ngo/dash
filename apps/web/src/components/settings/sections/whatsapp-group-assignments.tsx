import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { WhatsappGroup } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { handleMutationResult } from "@/lib/mutation-result";

const ORIENTATION_GROUP_ID = "orientation_group_id";
const ALL_VOLUNTEERS_GROUP_ID = "all_volunteers_group_id";

export function GroupAssignments({
  groups,
}: {
  groups: readonly WhatsappGroup[];
}) {
  const zero = useZero();
  const [configRows] = useQuery(queries.appConfig.all());

  const configMap = new Map(
    (configRows ?? []).map((row) => [row.key, row.value])
  );

  const orientationGroupId = configMap.get(ORIENTATION_GROUP_ID) ?? "";
  const allVolunteersGroupId = configMap.get(ALL_VOLUNTEERS_GROUP_ID) ?? "";

  const groupNameMap = new Map(groups.map((g) => [g.id, g.name]));

  const handleChange = async (key: string, value: string) => {
    const res = await zero.mutate(mutators.appConfig.upsert({ key, value }))
      .server;
    handleMutationResult(res, {
      mutation: "appConfig.upsert",
      entityId: key,
      successMsg: "Assignment updated",
      errorMsg: "Failed to update assignment",
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="font-medium text-xs">Group Assignments</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm">New volunteer group</Label>
          <Select
            onValueChange={(v) => {
              if (v) {
                handleChange(ORIENTATION_GROUP_ID, v);
              }
            }}
            value={orientationGroupId}
          >
            <SelectTrigger aria-label="New volunteer group">
              <SelectValue placeholder="Select a group">
                {groupNameMap.get(orientationGroupId) ?? "Select a group"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            New volunteers are added to this group when created.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm">Orientation completed group</Label>
          <Select
            onValueChange={(v) => {
              if (v) {
                handleChange(ALL_VOLUNTEERS_GROUP_ID, v);
              }
            }}
            value={allVolunteersGroupId}
          >
            <SelectTrigger aria-label="Orientation completed group">
              <SelectValue placeholder="Select a group">
                {groupNameMap.get(allVolunteersGroupId) ?? "Select a group"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Volunteers are moved here after completing orientation.
          </p>
        </div>
      </div>
    </div>
  );
}

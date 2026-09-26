"use client";

import { can, useMe } from "@/hooks/use-me";

/** UI hints only: Django enforces every rule (drivers only see and act on their own deliveries). */
export function useDeliveryAccess() {
  const { data: me } = useMe();
  const isDriver = me?.staff_level === "driver" && !me.is_top_admin;
  const canEdit = can(me, "deliveries", "edit");
  return {
    canEdit,
    isDriver,
    /** Drivers can't create deliveries or assign drivers. */
    canManage: canEdit && !isDriver,
  };
}

import { orderKeys } from "@/lib/api/services/orders";
import { inventoryKeys } from "@/lib/api/services/warehouse";

/**
 * A shop order change can reserve / release / deduct stock, open a delivery
 * and record a payment, so refresh all of those views.
 */
export const SHOP_INVALIDATE = [orderKeys.all, inventoryKeys.all, ["deliveries"], ["finance"], ["catalog"], ["marketplace"]];

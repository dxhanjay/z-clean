/**
 * Shared helper: combine a pickup date (yyyy-mm-dd) and a slot label
 * ("9 AM – 11 AM") into a local ISO timestamp for `pickup_slot` columns.
 * Used by /api/pickups and /api/orders.
 */
export function slotStartHour(slot: string): number {
  const match = slot.match(/^(\d{1,2})\s*(AM|PM)/i);
  if (!match) return 9;
  let hour = parseInt(match[1], 10);
  const meridiem = match[2].toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour;
}

export function pickupSlotIso(pickupDate: string, pickupSlot: string): string {
  const hour = String(slotStartHour(pickupSlot)).padStart(2, "0");
  return `${pickupDate}T${hour}:00:00`;
}

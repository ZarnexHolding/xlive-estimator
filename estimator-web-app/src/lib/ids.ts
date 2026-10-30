/** New identifier for any record. UUIDs, because ids are database keys in connected mode. */
export function newId(): string {
  return crypto.randomUUID();
}

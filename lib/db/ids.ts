const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guards the uuid columns so a malformed id is a miss, not a database error. */
export function isRecordId(id: string): boolean {
  return UUID_PATTERN.test(id);
}

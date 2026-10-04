export function isCurrentThemeRequest(
  activeAccountId: string | null,
  requestAccountId: string | null,
  currentRevision: number,
  requestRevision: number,
) {
  return (
    activeAccountId === requestAccountId && currentRevision === requestRevision
  );
}

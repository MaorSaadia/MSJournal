// Safe error text only. Never retain raw connection/SQL errors as a cause.
export class WorkspaceUnavailableError extends Error {
  constructor() {
    super(
      "Workspace temporarily unavailable. Check local database configuration and migrations.",
    );
  }
}

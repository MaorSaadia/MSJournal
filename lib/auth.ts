import "server-only";
import { createAuth } from "./auth-options";
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ??= createAuth());
}

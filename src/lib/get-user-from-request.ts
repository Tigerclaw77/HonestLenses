import {
  getRequestUser,
  hasTrustedMutationOrigin,
} from "@/lib/auth/authorization";

export async function getUserFromRequest(request: Request) {
  const identity = await getRequestUser(request);
  if (
    identity?.source === "cookie" &&
    !hasTrustedMutationOrigin(request)
  ) {
    return null;
  }
  return identity?.user ?? null;
}

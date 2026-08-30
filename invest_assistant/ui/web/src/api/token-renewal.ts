export const tokenStorageKey = "liuli.auth.token";

type TokenStorage = Pick<Storage, "setItem">;

export function saveRenewedAccessToken(token: string | null | undefined, storage: TokenStorage) {
  if (token) {
    storage.setItem(tokenStorageKey, token);
  }
}

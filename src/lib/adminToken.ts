// Where the browser keeps the admin token. The admin page writes it on login
// and clears it on a 401; the sensor page reads it so an admin can open a
// bench unit's page without a share key. One key name, imported by both.

export const ADMIN_TOKEN_STORAGE_KEY = "sw-admin-token";

export function adminToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function authHeaders(): HeadersInit {
  const token = adminToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

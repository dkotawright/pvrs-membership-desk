// Unknown hosts fail closed instead of falling back to production.
export function environmentForHost(hostname) {
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return "local";
  if (["pvrs-membership.web.app", "pvrs-membership.firebaseapp.com"].includes(hostname)) return "production";
  if (["pvrs-membership-test.web.app", "pvrs-membership-test.firebaseapp.com"].includes(hostname)
      || /^pvrs-membership-test--[a-z0-9-]+\.web\.app$/.test(hostname)) return "test";
  throw new Error("This address has no approved Firebase environment.");
}

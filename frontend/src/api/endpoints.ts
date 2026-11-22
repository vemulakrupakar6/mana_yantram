export const endpoints = {
  register: "/auth/register",
  login: "/auth/login",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  logoutAll: "/auth/logout-all",
  me: "/auth/me",
  password: "/auth/change-password",
  profile: "/users/profile",
  portal: (name: "farmer" | "provider" | "admin") => "/portals/" + name,
} as const;

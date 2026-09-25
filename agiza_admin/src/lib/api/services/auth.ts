import { api, session } from "../client";
import type { Me } from "../types";

export const authService = {
  login: (email: string, password: string) => session.login<{ user: Me }>({ email, password }),
  logout: () => session.logout(),
  me: () => api.get<Me>("auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    api.post<void>("auth/change-password", { current_password, new_password }),
};

import { api } from "../client";
import type { City, Country } from "../types";

export const locationsService = {
  countries: (query?: { is_sourcing_origin?: boolean }) => api.get<Country[]>("countries", query),
  cities: (query?: { country?: number; region?: number; search?: string }) => api.get<City[]>("cities", query),
};

import { api } from "../client";
import type { City, Country, Region } from "../types";

export const locationsService = {
  countries: (query?: { is_sourcing_origin?: boolean }) => api.get<Country[]>("countries", query),
  regions: (query?: { country?: number }) => api.get<Region[]>("regions", query),
  cities: (query?: { country?: number; region?: number; search?: string }) => api.get<City[]>("cities", query),
};

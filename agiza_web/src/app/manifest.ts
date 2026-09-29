import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AGIZA",
    short_name: "AGIZA",
    description: "Shop AGIZA and Tanzania's trusted stores, delivered by AGIZA.",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F7F9",
    theme_color: "#E25805",
    icons: [{ src: "/icon.png", sizes: "1024x1024", type: "image/png" }],
  };
}

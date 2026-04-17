import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Queue SaaS",
    short_name: "SmartQueue",
    description: "Digital queue management for micro food and beverage businesses.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#f97316",
    icons: [
      {
        src: "/icon.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

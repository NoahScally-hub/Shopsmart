import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GH_PAGES is set by the deploy workflow so assets resolve under /Shopsmart/
export default defineConfig({
  base: process.env.GH_PAGES ? "/Shopsmart/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "ShopSmart",
        short_name: "ShopSmart",
        description: "Smart shopping lists, price comparison and trip planning",
        theme_color: "#16a34a",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
});

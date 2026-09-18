import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = getAppUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/presupuestos", "/clientes", "/estadisticas", "/configuracion", "/q/", "/admin"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}

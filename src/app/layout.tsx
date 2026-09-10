import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Berrima Cement Works — Digital Twin",
  description:
    "Interactive digital twin of the Boral Cement Works at Berrima, NSW: satellite site map, 3D plant model, asset inventory and QR stock verification.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  )
}

import '@tremor/react/dist/esm/tremor.css';
import "tailwindcss/tailwind.css";
import { Inter } from "@next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      {/*
        <head /> will contain the components returned by the nearest parent
        head.tsx. Find out more at https://beta.nextjs.org/docs/api-reference/file-conventions/head
      */}
      <head />
      <body >{children}</body>
    </html>
  )
}

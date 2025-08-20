import { Links, Meta, Outlet, Scripts } from "@remix-run/react";
import stylesheet from "./tailwind.css?url";

export const links = () => [
  { rel: "stylesheet", href: stylesheet }
];

export default function App() {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="icon" href="data:image/x-icon;base64,AA" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
  
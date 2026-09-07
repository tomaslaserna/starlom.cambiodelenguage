import type { Metadata } from "next";
import { PortalApp } from "./portal-app";

export const metadata: Metadata = { title: "Portal de clientes | Starlim" };

export default function PortalPage() { return <PortalApp />; }

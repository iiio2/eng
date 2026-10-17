import dynamic from "next/dynamic";
import { Splash } from "@/components/Splash";

// Client-only: the child's profile and transcript live in this device's storage.
const ChildApp = dynamic(() => import("@/components/ChildApp"), { ssr: false, loading: Splash });

export default function Home() {
  return <ChildApp />;
}

import dynamic from "next/dynamic";
import Head from "next/head";
import { Splash } from "@/components/Splash";

// Client-only: the parent token lives in this device's storage.
const ParentApp = dynamic(() => import("@/components/parent/ParentApp"), { ssr: false, loading: Splash });

export default function ParentPage() {
  return (
    <>
      <Head>
        <title>Parent corner · English Buddy</title>
      </Head>
      <ParentApp />
    </>
  );
}

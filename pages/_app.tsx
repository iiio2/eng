import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Andika, Nunito } from "next/font/google";
import Head from "next/head";

// Andika is designed for beginning readers (single-storey a and g).
const andika = Andika({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-andika" });
const nunito = Nunito({ weight: ["700", "800"], subsets: ["latin"], variable: "--font-nunito" });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>English Buddy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <div className={`${andika.variable} ${nunito.variable} font-sans`}>
        <Component {...pageProps} />
      </div>
    </>
  );
}

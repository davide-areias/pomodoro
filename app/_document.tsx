import Document, { Html, Head, Main, NextScript } from "next/document";

class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          {/* Set the primary theme color */}
          <meta name="theme-color" content="#000000" />

          {/* Link to the manifest file for PWA support */}
          <link rel="manifest" href="/manifest.json" />

          {/* Apple touch icon */}
          <link rel="apple-touch-icon" href="/logo-192.png" />

          {/* Optionally add more meta tags here */}
        </Head>
        <body className="bg-black text-bone">
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument; 
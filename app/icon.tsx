import { ImageResponse } from "next/og";

import { ChallengeMark } from "@/components/brand/challenge-mark";

export const contentType = "image/png";

export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType },
    { id: "512", size: { width: 512, height: 512 }, contentType },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#2f6b4f",
      }}
    >
      {/*
       * The maskable safe zone is a circle of 80% diameter, and a square
       * layout puts its content at the corners, so the mark can only be
       * 0.8/sqrt(2) of the canvas before the corner glyphs risk clipping.
       */}
      <ChallengeMark size={Math.round(size * 0.56)} />
    </div>,
    { width: size, height: size },
  );
}

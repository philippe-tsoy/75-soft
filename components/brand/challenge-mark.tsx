interface GlyphProps {
  size: number;
  fill: string;
}

/*
 * Each glyph is a self-contained SVG laid out with flexbox rather than a
 * transformed group, because satori renders the metadata icons and its
 * support for nested SVG transforms is unreliable. Shapes carry an explicit
 * fill for the same reason: inherited fills do not survive the conversion.
 */

function Dumbbell({ size, fill }: GlyphProps) {
  return (
    <svg height={size} viewBox="0 0 24 24" width={size}>
      <rect fill={fill} height="10" rx="1.4" width="4" x="1.5" y="7" />
      <rect fill={fill} height="10" rx="1.4" width="4" x="18.5" y="7" />
      <rect fill={fill} height="4.4" rx="1.4" width="12" x="6" y="9.8" />
    </svg>
  );
}

function Droplet({ size, fill }: GlyphProps) {
  return (
    <svg height={size} viewBox="0 0 24 24" width={size}>
      <path d="M12 2.7l5.66 5.66a8 8 0 1 1-11.31 0z" fill={fill} />
    </svg>
  );
}

function Book({ size, fill }: GlyphProps) {
  return (
    <svg height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M11 7.4C9.4 6 7.1 5.3 4.2 5.3H2.4v12.1h2.4c2.5 0 4.5.6 5.9 1.9h.3z"
        fill={fill}
      />
      <path
        d="M13 7.4c1.6-1.4 3.9-2.1 6.8-2.1h1.8v12.1h-2.4c-2.5 0-4.5.6-5.9 1.9H13z"
        fill={fill}
      />
    </svg>
  );
}

function Apple({ size, fill }: GlyphProps) {
  return (
    <svg height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M12 8.1c1.7-1.5 4.2-1.7 5.9-.2 1.9 1.7 2 4.8.6 7.5-1 2-2.7 4-4.3 4.8-.8.4-1.6.4-2.4 0-1.6-.8-3.3-2.8-4.3-4.8-1.4-2.7-1.3-5.8.6-7.5 1.7-1.5 4.2-1.3 5.9.2z"
        fill={fill}
      />
      <path
        d="M12.5 6.8c.2-2 1.8-3.6 3.8-3.8.1 2-1.6 3.7-3.8 3.8z"
        fill={fill}
      />
    </svg>
  );
}

export function ChallengeMark({
  size,
  fill = "#ffffff",
}: {
  size: number;
  fill?: string;
}) {
  const glyph = Math.round(size * 0.46);

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Dumbbell fill={fill} size={glyph} />
        <Droplet fill={fill} size={glyph} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Book fill={fill} size={glyph} />
        <Apple fill={fill} size={glyph} />
      </div>
    </div>
  );
}

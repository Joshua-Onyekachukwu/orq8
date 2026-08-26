import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ORQ8: Run your company with AI employees";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#0d1427",
          position: "relative",
          textAlign: "center",
          padding: "0 80px",
        }}
      >
        {/* command-center grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.07,
            backgroundImage:
              "linear-gradient(rgba(200,255,50,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,50,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* soft glow */}
        <div
          style={{
            position: "absolute",
            width: 560,
            height: 560,
            borderRadius: 999,
            background: "rgba(200,255,50,0.12)",
            filter: "blur(120px)",
            bottom: -200,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 34 }}>
          <div style={{ width: 26, height: 26, borderRadius: 999, background: "#c8ff32" }} />
          <div style={{ fontSize: 68, fontWeight: 800, color: "#ffffff", letterSpacing: "-3px", lineHeight: 1 }}>
            ORQ8
          </div>
        </div>

        <div
          style={{
            fontSize: 26,
            color: "#c8ff32",
            fontWeight: 700,
            letterSpacing: 5,
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          The AI organization operating system
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 30,
            color: "#ffffff",
            opacity: 0.8,
            lineHeight: 1.4,
            maxWidth: 820,
          }}
        >
          You set the direction. ORQ8 hires the team, does the work,
          <br />
          and reports back under your approvals, your budgets, your audit trail.
        </div>
      </div>
    ),
    { ...size }
  );
}

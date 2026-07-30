import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          red: "#F2565C",
          blue: "#84D7FF",
          orange: "#FF8C33",
          ink: "#2A2A2E",
          cream: "#FBF7F0",
          // สีประจำหน่วยงาน/แบรนด์ (v1.25) — yogi = ฝ่ายผลิต · staple = แบรนด์ที่ 2 ที่ KCN/NCD
          yogi: "#29B5E8",
          staple: "#542916",
        },
        ok: "#2FA36B",
        warn: "#E0483F",
      },
      fontFamily: {
        sans: ["Kanit", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px rgba(20,15,10,0.08)",
      },
      backdropBlur: {
        xl: "24px",
      },
    },
  },
  plugins: [],
};
export default config;

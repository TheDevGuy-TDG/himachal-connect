"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Video,
  MessageCircle,
  Users,
  Shield,
  Sparkles,
  MapPin,
} from "lucide-react";

interface LandingPageProps {
  onJoin: (name: string, gender: string) => void;
}

export default function LandingPage({ onJoin }: LandingPageProps) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleStart = () => {
    if (!name.trim()) return setError("Apna naam toh batao!");
    if (!gender) return setError("Gender select karo!");
    setError("");
    onJoin(name.trim(), gender);
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden", background: "#06020f" }}>
      {/* ===== BG Orbs ===== */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div
          className="anim-float"
          style={{
            position: "absolute", top: "-20%", left: "-10%",
            width: 700, height: 700, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(225,29,72,0.15) 0%, transparent 65%)",
          }}
        />
        <div
          className="anim-float"
          style={{
            position: "absolute", bottom: "-25%", right: "-10%",
            width: 800, height: 800, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 65%)",
            animationDelay: "3s",
          }}
        />
        <div
          className="anim-float"
          style={{
            position: "absolute", top: "30%", left: "50%",
            width: 500, height: 500, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(236,72,153,0.1) 0%, transparent 65%)",
            animationDelay: "1.5s",
          }}
        />
      </div>

      {/* ===== NAVBAR ===== */}
      <nav
        className="glass-nav"
        style={{
          position: "relative", zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/logo.png" alt="Himachal Connect" width={40} height={40} style={{ borderRadius: 8 }} />
          <span className="gradient-text" style={{ fontSize: 20, fontWeight: 800 }}>
            Himachal Connect
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#a07898" }}>
          <MapPin style={{ width: 16, height: 16, color: "#f43f5e" }} />
          <span style={{ fontSize: 13 }}>Himachal Pradesh</span>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <main
        style={{
          position: "relative", zIndex: 10,
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "50px 20px 60px",
        }}
      >
        {/* Tag line */}
        <div
          className={mounted ? "anim-fade-up" : ""}
          style={{
            opacity: mounted ? undefined : 0,
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 20px", borderRadius: 50,
            background: "rgba(168, 85, 247, 0.1)",
            border: "1px solid rgba(168, 85, 247, 0.2)",
            marginBottom: 32, fontSize: 14,
          }}
        >
          <Sparkles style={{ width: 16, height: 16, color: "#facc15" }} />
          <span style={{ color: "#c8a0d0" }}>Pahaadon ki dosti, ab online bhi!</span>
        </div>

        {/* Heading */}
        <h1
          className={mounted ? "anim-fade-up" : ""}
          style={{
            opacity: mounted ? undefined : 0, animationDelay: "0.15s",
            textAlign: "center", marginBottom: 16,
            fontSize: "clamp(3rem, 8vw, 5.5rem)", fontWeight: 900, lineHeight: 1.1,
          }}
        >
          <span className="gradient-text">Himachal</span>
          <br />
          <span style={{ color: "#fff" }}>Connect </span>
          <span>❤️‍🔥</span>
        </h1>

        {/* Subtitle */}
        <p
          className={mounted ? "anim-fade-up" : ""}
          style={{
            opacity: mounted ? undefined : 0, animationDelay: "0.3s",
            textAlign: "center", maxWidth: 480, color: "#a08aac",
            fontSize: 17, lineHeight: 1.7, marginBottom: 40,
          }}
        >
          Himachal ke logon ke liye apna platform. Random video chat karo,
          nayi dosti banao, aur pahaadon ka pyaar feel karo!
        </p>

        {/* ===== JOIN CARD ===== */}
        <div
          className={mounted ? "anim-fade-up" : ""}
          style={{
            opacity: mounted ? undefined : 0, animationDelay: "0.45s",
            width: "100%", maxWidth: 420,
            background: "linear-gradient(160deg, #1a0e30 0%, #120828 50%, #1a0e30 100%)",
            border: "1px solid rgba(168, 85, 247, 0.25)",
            borderRadius: 24, padding: "36px 32px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 80px rgba(124,58,237,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <h2
            className="gradient-text"
            style={{ textAlign: "center", fontSize: 24, fontWeight: 700, marginBottom: 28 }}
          >
            Shuru Karein?
          </h2>

          {/* Name Input */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#b090c0", marginBottom: 10 }}>
              Apna Naam
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Naam likho..."
              maxLength={20}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              style={{
                width: "100%", padding: "14px 18px", borderRadius: 14,
                background: "rgba(6, 2, 15, 0.8)",
                border: "1.5px solid rgba(168, 85, 247, 0.25)",
                color: "#fff", fontSize: 15, outline: "none",
                transition: "border-color 0.3s, box-shadow 0.3s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(244, 63, 94, 0.6)";
                e.currentTarget.style.boxShadow = "0 0 20px rgba(244, 63, 94, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.25)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Gender Select */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#b090c0", marginBottom: 12 }}>
              Gender Select Karo
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Boy */}
              <button
                onClick={() => setGender("male")}
                style={{
                  padding: "14px 0", borderRadius: 14,
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  transition: "all 0.3s ease",
                  background: gender === "male" ? "rgba(59, 130, 246, 0.15)" : "rgba(6, 2, 15, 0.6)",
                  border: gender === "male" ? "2px solid #3b82f6" : "1.5px solid rgba(168, 85, 247, 0.2)",
                  color: gender === "male" ? "#60a5fa" : "#8070a0",
                  boxShadow: gender === "male" ? "0 0 25px rgba(59, 130, 246, 0.15), inset 0 0 20px rgba(59, 130, 246, 0.05)" : "none",
                }}
              >
                👨 Boy
              </button>
              {/* Girl */}
              <button
                onClick={() => setGender("female")}
                style={{
                  padding: "14px 0", borderRadius: 14,
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  transition: "all 0.3s ease",
                  background: gender === "female" ? "rgba(236, 72, 153, 0.15)" : "rgba(6, 2, 15, 0.6)",
                  border: gender === "female" ? "2px solid #ec4899" : "1.5px solid rgba(168, 85, 247, 0.2)",
                  color: gender === "female" ? "#f472b6" : "#8070a0",
                  boxShadow: gender === "female" ? "0 0 25px rgba(236, 72, 153, 0.15), inset 0 0 20px rgba(236, 72, 153, 0.05)" : "none",
                }}
              >
                👩 Girl
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p style={{ color: "#f87171", fontSize: 13, textAlign: "center", marginBottom: 16, fontWeight: 500 }}>
              {error}
            </p>
          )}

          {/* Start Button */}
          <button
            onClick={handleStart}
            className="anim-gradient"
            style={{
              width: "100%", padding: "16px 0", borderRadius: 16,
              border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #e11d48, #9333ea, #e11d48)",
              backgroundSize: "200% 200%",
              color: "#fff", fontSize: 17, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: "0 6px 30px rgba(225, 29, 72, 0.35), 0 0 50px rgba(147, 51, 234, 0.15)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.boxShadow = "0 10px 40px rgba(225, 29, 72, 0.5), 0 0 60px rgba(147, 51, 234, 0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 6px 30px rgba(225, 29, 72, 0.35), 0 0 50px rgba(147, 51, 234, 0.15)";
            }}
          >
            <Video style={{ width: 20, height: 20 }} />
            Start Connecting!
          </button>

          <p style={{ textAlign: "center", fontSize: 11, color: "#6a5080", marginTop: 20 }}>
            18+ only. Be respectful to everyone.
          </p>
        </div>

        {/* ===== FEATURES ===== */}
        <div
          className={mounted ? "anim-fade-up" : ""}
          style={{
            opacity: mounted ? undefined : 0, animationDelay: "0.6s",
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16,
            maxWidth: 900, width: "100%", marginTop: 64, padding: "0 16px",
          }}
        >
          {[
            { icon: Video, title: "Video Chat", desc: "HD video calling with strangers", color: "#fb7185", bg: "rgba(244,63,94,0.08)", border: "rgba(244,63,94,0.2)" },
            { icon: MessageCircle, title: "Text Chat", desc: "Chat karo bina video ke bhi", color: "#a78bfa", bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.2)" },
            { icon: Users, title: "Smart Match", desc: "Boy-Girl matching preference", color: "#f472b6", bg: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.2)" },
            { icon: Shield, title: "Safe & Secure", desc: "Anonymous & private chatting", color: "#34d399", bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.2)" },
          ].map(({ icon: Icon, title, desc, color, bg, border }) => (
            <div
              key={title}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                textAlign: "center", padding: "28px 16px", borderRadius: 20,
                background: "linear-gradient(160deg, rgba(20,12,40,0.9), rgba(10,5,25,0.9))",
                border: `1px solid ${border}`,
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                transition: "all 0.3s ease",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-6px)";
                e.currentTarget.style.boxShadow = `0 12px 40px rgba(0,0,0,0.4), 0 0 30px ${bg}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)";
              }}
            >
              <div
                style={{
                  width: 56, height: 56, borderRadius: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: bg, border: `1px solid ${border}`,
                  marginBottom: 16,
                }}
              >
                <Icon style={{ width: 26, height: 26, color }} />
              </div>
              <h3 style={{ color: "#fff", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                {title}
              </h3>
              <p style={{ color: "#8070a0", fontSize: 12, lineHeight: 1.5 }}>
                {desc}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 60, textAlign: "center", color: "#5a4870", fontSize: 13 }}>
          <p>Made with ❤️ for Himachal Pradesh</p>
          <p style={{ marginTop: 4 }}>Pahaadon ki dosti, digital andaaz mein</p>
        </div>
      </main>

      {/* ===== Responsive: mobile feature grid ===== */}
      <style>{`
        @media (max-width: 768px) {
          main > div:nth-last-child(2) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

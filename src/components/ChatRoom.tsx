"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import Image from "next/image";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  SkipForward,
  LogOut,
  Send,
  MessageCircle,
  X,
  Users,
  Heart,
  Flag,
  Ban,
  AlertTriangle,
} from "lucide-react";

interface ChatRoomProps {
  userName: string;
  userGender: string;
  onLeave: () => void;
}

interface ChatMessage {
  text: string;
  sender: "me" | "them";
  timestamp: number;
}

type Status = "connecting" | "waiting" | "matched" | "disconnected";

export default function ChatRoom({ userName, userGender, onLeave }: ChatRoomProps) {
  const [status, setStatus] = useState<Status>("connecting");
  const [partnerName, setPartnerName] = useState("");
  const [partnerGender, setPartnerGender] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [onlineCount, setOnlineCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [reported, setReported] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const partnerIdRef = useRef<string>("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // Clear error after 4 seconds
  useEffect(() => {
    if (errorMsg) {
      const t = setTimeout(() => setErrorMsg(""), 4000);
      return () => clearTimeout(t);
    }
  }, [errorMsg]);

  const cleanupPeer = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const createPeerConnection = useCallback(
    (socket: Socket, partnerId: string) => {
      cleanupPeer();
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      peerConnectionRef.current = pc;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }
      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", { to: partnerId, candidate: event.candidate });
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          // Attempt ICE restart
          pc.restartIce();
        }
      };
      return pc;
    },
    [cleanupPeer]
  );

  const resetState = useCallback(() => {
    pendingCandidatesRef.current = [];
    setShowReportMenu(false);
    setReported(false);
  }, []);

  useEffect(() => {
    let socket: Socket;
    const init = async () => {
      // Get camera/mic
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
          setIsAudioOn(false);
        } catch {
          setErrorMsg("Camera access denied. Allow camera to video chat.");
        }
      }

      // Connect
      socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setStatus("waiting");
        socket.emit("join-queue", { gender: userGender, name: userName });
      });

      socket.on("disconnect", () => {
        setStatus("connecting");
      });

      socket.on("connect_error", () => {
        setErrorMsg("Connection error. Retrying...");
      });

      socket.on("error-msg", (msg: string) => {
        setErrorMsg(msg);
      });

      socket.on("online-count", (count: number) => setOnlineCount(count));
      socket.on("waiting", () => setStatus("waiting"));

      // Matched - now includes TURN servers from server
      socket.on("matched", async ({ partnerId, partnerName: pName, partnerGender: pGender, initiator, iceServers }: {
        partnerId: string; partnerName: string; partnerGender: string; initiator: boolean; iceServers?: RTCIceServer[];
      }) => {
        setStatus("matched");
        setPartnerName(pName);
        setPartnerGender(pGender);
        setMessages([]);
        setUnreadCount(0);
        resetState();
        partnerIdRef.current = partnerId;

        // Use server-provided TURN config
        if (iceServers && iceServers.length > 0) {
          iceServersRef.current = iceServers;
        }

        const pc = createPeerConnection(socket, partnerId);
        if (initiator) {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("offer", { to: partnerId, offer });
          } catch (err) { console.error("Error creating offer:", err); }
        }
      });

      socket.on("offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
        let pc = peerConnectionRef.current;
        if (!pc) return;
        if (pc.signalingState !== "stable") {
          cleanupPeer();
          pc = createPeerConnection(socket, from);
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          for (const c of pendingCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidatesRef.current = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { to: from, answer });
        } catch (err) { console.error("Error handling offer:", err); }
      });

      socket.on("answer", async ({ answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
        const pc = peerConnectionRef.current;
        if (!pc) return;
        if (pc.signalingState !== "have-local-offer") return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          for (const c of pendingCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidatesRef.current = [];
        } catch (err) { console.error("Error handling answer:", err); }
      });

      socket.on("ice-candidate", async ({ candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
        const pc = peerConnectionRef.current;
        if (!pc) return;
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          pendingCandidatesRef.current.push(candidate);
          return;
        }
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (err) { console.error("ICE error:", err); }
      });

      socket.on("chat-message", ({ message, timestamp }: { from: string; message: string; timestamp: number }) => {
        setMessages((prev) => [...prev, { text: message, sender: "them", timestamp }]);
        setUnreadCount((prev) => prev + 1);
      });

      socket.on("partner-skipped", () => {
        cleanupPeer(); resetState();
        setStatus("waiting"); setPartnerName(""); setMessages([]);
        socket.emit("join-queue", { gender: userGender, name: userName });
      });

      socket.on("partner-disconnected", () => {
        cleanupPeer(); resetState();
        setStatus("disconnected"); setPartnerName("");
      });

      socket.on("report-ack", () => setReported(true));
      socket.on("block-ack", () => {
        cleanupPeer(); resetState();
        setStatus("waiting"); setPartnerName(""); setMessages([]);
        socket.emit("join-queue", { gender: userGender, name: userName });
      });
    };

    init();
    return () => {
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
      cleanupPeer();
      if (socketRef.current) { socketRef.current.emit("leave-queue"); socketRef.current.disconnect(); }
    };
  }, [userName, userGender, createPeerConnection, cleanupPeer, resetState]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getVideoTracks()[0];
      if (t) { t.enabled = !t.enabled; setIsVideoOn(t.enabled); }
    }
  };
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getAudioTracks()[0];
      if (t) { t.enabled = !t.enabled; setIsAudioOn(t.enabled); }
    }
  };
  const handleSkip = () => {
    if (socketRef.current) {
      socketRef.current.emit("skip"); cleanupPeer(); resetState();
      setStatus("waiting"); setPartnerName(""); setMessages([]);
      socketRef.current.emit("join-queue", { gender: userGender, name: userName });
    }
  };
  const handleFindNew = () => {
    if (socketRef.current) {
      cleanupPeer(); resetState();
      setStatus("waiting"); setPartnerName(""); setMessages([]);
      socketRef.current.emit("join-queue", { gender: userGender, name: userName });
    }
  };
  const handleLeave = () => {
    if (socketRef.current) { socketRef.current.emit("leave-queue"); socketRef.current.disconnect(); }
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    cleanupPeer(); onLeave();
  };
  const sendMessage = () => {
    if (!inputMsg.trim() || !socketRef.current || !partnerIdRef.current) return;
    const msg = inputMsg.trim();
    socketRef.current.emit("chat-message", { to: partnerIdRef.current, message: msg });
    setMessages((prev) => [...prev, { text: msg, sender: "me", timestamp: Date.now() }]);
    setInputMsg("");
  };
  const handleReport = (reason: string) => {
    if (socketRef.current) socketRef.current.emit("report", { reason });
    setShowReportMenu(false);
  };
  const handleBlock = () => {
    if (socketRef.current) socketRef.current.emit("block");
    setShowReportMenu(false);
  };

  const CtrlBtn = ({ on, onClick, iconOn, iconOff }: { on: boolean; onClick: () => void; iconOn: React.ReactNode; iconOff: React.ReactNode }) => (
    <button onClick={onClick} style={{
      width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", transition: "all 0.2s ease", border: "none",
      background: on ? "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(168,85,247,0.15))" : "linear-gradient(135deg, rgba(220,38,38,0.25), rgba(220,38,38,0.15))",
      boxShadow: on ? "0 0 20px rgba(124,58,237,0.15), inset 0 0 0 1.5px rgba(168,85,247,0.35)" : "0 0 20px rgba(220,38,38,0.15), inset 0 0 0 1.5px rgba(220,38,38,0.35)",
      color: on ? "#e0d0f0" : "#fca5a5",
    }}>{on ? iconOn : iconOff}</button>
  );

  return (
    <div style={{ ...(isMobile ? { minHeight: "100vh" } : { height: "100vh", overflow: "hidden" }), display: "flex", flexDirection: "column", background: "#06020f" }}>
      {/* Error toast */}
      {errorMsg && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 100,
          padding: "12px 24px", borderRadius: 14, display: "flex", alignItems: "center", gap: 10,
          background: "rgba(220,38,38,0.9)", border: "1px solid rgba(220,38,38,0.5)",
          color: "#fff", fontSize: 14, fontWeight: 600, boxShadow: "0 8px 30px rgba(220,38,38,0.3)",
          animation: "fade-up 0.3s ease",
        }}>
          <AlertTriangle style={{ width: 18, height: 18 }} />
          {errorMsg}
        </div>
      )}

      {/* Report modal */}
      {showReportMenu && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        }} onClick={() => setShowReportMenu(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "90%", maxWidth: 360, padding: 28, borderRadius: 24,
            background: "linear-gradient(160deg, #1a0e30, #120828)",
            border: "1px solid rgba(168,85,247,0.25)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}>
            <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
              <Flag style={{ width: 18, height: 18, display: "inline", marginRight: 8, color: "#f43f5e" }} />
              Report / Block
            </h3>
            <p style={{ color: "#a080b0", fontSize: 13, marginBottom: 20 }}>
              {partnerName} ko report ya block karo
            </p>

            {reported ? (
              <p style={{ color: "#22c55e", fontSize: 14, fontWeight: 600, textAlign: "center", padding: 20 }}>
                Report submitted! Thank you.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {["Inappropriate behavior", "Harassment", "Spam / Bot", "Underage user"].map((r) => (
                  <button key={r} onClick={() => handleReport(r)} style={{
                    padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(168,85,247,0.15)",
                    background: "rgba(6,2,15,0.5)", color: "#d0c0e0", fontSize: 14,
                    cursor: "pointer", textAlign: "left", transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(244,63,94,0.1)"; e.currentTarget.style.borderColor = "rgba(244,63,94,0.3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(6,2,15,0.5)"; e.currentTarget.style.borderColor = "rgba(168,85,247,0.15)"; }}
                  >{r}</button>
                ))}
                <button onClick={handleBlock} style={{
                  padding: "12px 16px", borderRadius: 12, marginTop: 4,
                  border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.1)",
                  color: "#f87171", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.1)"; }}
                >
                  <Ban style={{ width: 16, height: 16 }} />
                  Block & Skip (never match again)
                </button>
              </div>
            )}

            <button onClick={() => setShowReportMenu(false)} style={{
              marginTop: 16, width: "100%", padding: "10px", borderRadius: 12,
              border: "1px solid rgba(168,85,247,0.15)", background: "transparent",
              color: "#8070a0", fontSize: 13, cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <div style={{
        position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", background: "linear-gradient(145deg, rgba(35,22,60,0.95), rgba(15,8,30,0.95))",
        borderBottom: "1px solid rgba(168,85,247,0.15)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/logo.png" alt="Logo" width={36} height={36} style={{ borderRadius: 8 }} />
          <span className="gradient-text" style={{ fontSize: 17, fontWeight: 800, display: isMobile ? "none" : undefined }}>Himachal Connect</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#b090c0" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.5)" }} />
            <Users style={{ width: 15, height: 15 }} />
            <span>{onlineCount}</span>
          </div>
          {status === "matched" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 50, background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.25)", fontSize: 13 }}>
                <Heart style={{ width: 13, height: 13, color: "#f472b6" }} />
                <span style={{ color: "#f472b6", fontWeight: 600 }}>{partnerName}</span>
                <span style={{ color: "#9080a0" }}>{partnerGender === "male" ? "👨" : "👩"}</span>
              </div>
              <button onClick={() => setShowReportMenu(true)} title="Report" style={{
                width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(244,63,94,0.1)", color: "#f87171", transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(244,63,94,0.2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(244,63,94,0.1)"; }}
              ><Flag style={{ width: 14, height: 14 }} /></button>
            </>
          )}
          <button onClick={handleLeave} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 50, cursor: "pointer",
            background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.25)",
            color: "#f87171", fontSize: 13, fontWeight: 600, transition: "all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.1)"; }}
          >
            <LogOut style={{ width: 14, height: 14 }} />
            <span style={{ display: isMobile ? "none" : undefined }}>Leave</span>
          </button>
        </div>
      </div>

      {/* ===== MAIN ===== */}
      <div style={{ flex: 1, display: "flex", position: "relative", zIndex: 5, padding: 12, gap: 12, overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>
        {/* Video section */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, position: "relative", justifyContent: "center", alignItems: "center" }}>
          <div style={{
            width: "100%", ...(isMobile ? { minHeight: 300 } : { aspectRatio: "16/9", maxHeight: "calc(100vh - 160px)" }), position: "relative", borderRadius: 20, overflow: "hidden",
            background: "linear-gradient(160deg, #0d0520, #080318)",
            border: "1px solid rgba(168,85,247,0.15)",
            boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), 0 4px 30px rgba(0,0,0,0.3)",
          }}>
            {status === "matched" ? (
              <>
                <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
                <div style={{
                  position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 16px", borderRadius: 50, background: "rgba(10,5,20,0.75)", backdropFilter: "blur(10px)",
                  border: "1px solid rgba(168,85,247,0.2)", fontSize: 13, color: "#e0d0f0",
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.5)" }} />
                  {partnerName}
                </div>
              </>
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 30 }}>
                {status === "connecting" && (
                  <>
                    <div style={{ width: 60, height: 60, borderRadius: "50%", border: "4px solid rgba(168,85,247,0.2)", borderTopColor: "#a855f7", animation: "spin 1s linear infinite" }} />
                    <p style={{ color: "#b090c0", fontSize: 17 }}>Connecting...</p>
                  </>
                )}
                {status === "waiting" && (
                  <>
                    <div className="anim-pulse-glow" style={{
                      width: 100, height: 100, borderRadius: "50%",
                      background: "linear-gradient(135deg, #e11d48, #7c3aed)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}><Users style={{ width: 44, height: 44, color: "#fff" }} /></div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Finding someone for you...</p>
                      <p style={{ color: "#a080b0", fontSize: 15 }}>Wait karo, koi milega abhi! 🏔️</p>
                      <div className="loading-dots" style={{ marginTop: 16 }}><span /><span /><span /></div>
                    </div>
                  </>
                )}
                {status === "disconnected" && (
                  <>
                    <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <X style={{ width: 40, height: 40, color: "#f43f5e" }} />
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Partner disconnect ho gaya</p>
                      <p style={{ color: "#a080b0", marginBottom: 20 }}>Koi nahi, naya dhoondh lete hain!</p>
                      <button onClick={handleFindNew} className="anim-gradient" style={{
                        padding: "14px 32px", borderRadius: 50, border: "none", cursor: "pointer",
                        background: "linear-gradient(135deg, #e11d48, #9333ea, #e11d48)", backgroundSize: "200% 200%",
                        color: "#fff", fontSize: 16, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8,
                        boxShadow: "0 6px 25px rgba(225,29,72,0.3)",
                      }}><SkipForward style={{ width: 18, height: 18 }} />Find Next</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Local video */}
            <div style={{
              position: "absolute", bottom: 12, right: 12, zIndex: 15,
              width: isMobile ? 110 : 160, height: isMobile ? 82 : 120,
              borderRadius: 12, overflow: "hidden",
              border: "2px solid rgba(168,85,247,0.35)",
              boxShadow: "0 8px 30px rgba(0,0,0,0.6), 0 0 20px rgba(168,85,247,0.1)", background: "#000",
            }}>
              <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
              <div style={{ position: "absolute", bottom: 4, left: 8, fontSize: 11, color: "rgba(255,255,255,0.6)", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>You</div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "10px 0" }}>
            <CtrlBtn on={isVideoOn} onClick={toggleVideo} iconOn={<Video style={{ width: 22, height: 22 }} />} iconOff={<VideoOff style={{ width: 22, height: 22 }} />} />
            <CtrlBtn on={isAudioOn} onClick={toggleAudio} iconOn={<Mic style={{ width: 22, height: 22 }} />} iconOff={<MicOff style={{ width: 22, height: 22 }} />} />
            {status === "matched" && (
              <button onClick={handleSkip} style={{
                height: 52, padding: "0 28px", borderRadius: 50, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #e11d48, #7c3aed)", color: "#fff", fontSize: 15, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 20px rgba(225,29,72,0.3)", transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 30px rgba(225,29,72,0.45)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(225,29,72,0.3)"; e.currentTarget.style.transform = "translateY(0)"; }}
              ><SkipForward style={{ width: 18, height: 18 }} />Next</button>
            )}
            {isMobile && (
              <button onClick={() => { setIsChatOpen(!isChatOpen); if (!isChatOpen) setUnreadCount(0); }} style={{
                width: 52, height: 52, borderRadius: "50%", position: "relative",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none",
                background: "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(168,85,247,0.15))",
                boxShadow: "0 0 20px rgba(124,58,237,0.15), inset 0 0 0 1.5px rgba(168,85,247,0.35)", color: "#e0d0f0",
              }}>
                <MessageCircle style={{ width: 22, height: 22 }} />
                {unreadCount > 0 && (<span style={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, borderRadius: "50%", background: "#f43f5e", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{unreadCount}</span>)}
              </button>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div style={{
          ...(isMobile
            ? { position: "fixed" as const, inset: 0, zIndex: 30, transition: "transform 0.3s ease", transform: isChatOpen ? "translateY(0)" : "translateY(100%)" }
            : { width: 320, display: "flex", flexDirection: "column" as const }),
        }}>
          <div style={{
            height: "100%", display: "flex", flexDirection: "column",
            background: "linear-gradient(160deg, rgba(25,15,45,0.97), rgba(12,6,25,0.97))",
            border: "1px solid rgba(168,85,247,0.15)", borderRadius: isMobile ? 0 : 20, overflow: "hidden",
            boxShadow: "0 4px 30px rgba(0,0,0,0.4)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid rgba(168,85,247,0.12)", background: "rgba(10,5,20,0.3)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <MessageCircle style={{ width: 18, height: 18, color: "#f43f5e" }} />
                <span style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>Chat</span>
                {status === "matched" && <span style={{ fontSize: 13, color: "#a080b0" }}>with {partnerName}</span>}
              </div>
              {isMobile && (
                <button onClick={() => setIsChatOpen(false)} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", color: "#a080b0" }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
              {status !== "matched" ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8070a0", fontSize: 14, textAlign: "center", padding: 20 }}>
                  <p>Jab koi connect hoga, tab chat kar paoge! 💬</p>
                </div>
              ) : messages.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8070a0", fontSize: 14, textAlign: "center", padding: 20 }}>
                  <div><p>Say hi to {partnerName}! 👋</p><p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Start the conversation</p></div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: msg.sender === "me" ? "flex-end" : "flex-start" }}>
                    <div className={`chat-bubble ${msg.sender === "me" ? "chat-bubble-sent" : "chat-bubble-received"}`}>{msg.text}</div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: 12, borderTop: "1px solid rgba(168,85,247,0.12)" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" value={inputMsg} onChange={(e) => setInputMsg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder={status === "matched" ? "Type a message..." : "Wait for match..."}
                  disabled={status !== "matched"}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 14, background: "rgba(6,2,15,0.6)",
                    border: "1.5px solid rgba(168,85,247,0.2)", color: "#fff", fontSize: 14, outline: "none",
                    opacity: status !== "matched" ? 0.4 : 1, transition: "border-color 0.3s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(244,63,94,0.5)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.2)"; }}
                />
                <button onClick={sendMessage} disabled={status !== "matched" || !inputMsg.trim()} style={{
                  width: 44, height: 44, borderRadius: 14, border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg, #e11d48, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", opacity: (status !== "matched" || !inputMsg.trim()) ? 0.3 : 1, transition: "all 0.2s",
                  boxShadow: "0 4px 15px rgba(225,29,72,0.2)",
                }}><Send style={{ width: 16, height: 16 }} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

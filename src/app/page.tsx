"use client";

import { useState } from "react";
import LandingPage from "@/components/LandingPage";
import ChatRoom from "@/components/ChatRoom";

export default function Home() {
  const [joined, setJoined] = useState(false);
  const [userInfo, setUserInfo] = useState({ name: "", gender: "male" });

  const handleJoin = (name: string, gender: string) => {
    setUserInfo({ name, gender });
    setJoined(true);
  };

  if (joined) {
    return (
      <ChatRoom
        userName={userInfo.name}
        userGender={userInfo.gender}
        onLeave={() => setJoined(false)}
      />
    );
  }

  return <LandingPage onJoin={handleJoin} />;
}

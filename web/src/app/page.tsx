"use client";

import { useProgression } from "@/context/ProgressionContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { hasLoaded } = useProgression();
  const router = useRouter();

  useEffect(() => {
    if (hasLoaded) {
      const name = localStorage.getItem("duelistName");
      if (!name) {
        router.push('/onboarding');
      } else {
        router.push('/menu');
      }
    }
  }, [hasLoaded, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="animate-pulse">Loading...</div>
    </div>
  );
}

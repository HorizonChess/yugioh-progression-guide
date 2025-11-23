"use client";

import { useProgression } from "@/context/ProgressionContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { hasStarted, hasLoaded } = useProgression();
  const router = useRouter();

  useEffect(() => {
    if (hasLoaded) {
      if (hasStarted) {
        router.push('/map');
      } else {
        router.push('/start');
      }
    }
  }, [hasLoaded, hasStarted, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="animate-pulse">Loading...</div>
    </div>
  );
}

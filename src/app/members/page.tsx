"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function MembersIndex() {
  const router = useRouter();
  useEffect(() => {
    const auth = getAuth();
    if (!auth) { router.replace("/members/login"); return; }
    const unsub = onAuthStateChanged(auth, (user) => {
      router.replace(user ? "/members/projects" : "/members/login");
    });
    return unsub;
  }, [router]);
  return (
    <div className="min-h-screen bg-[#0F1014] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#85CC17]/30 border-t-[#85CC17] rounded-full animate-spin" />
    </div>
  );
}

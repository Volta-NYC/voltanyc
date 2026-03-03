"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/members/firebaseAuth";
import { getInviteCodeByValue, updateInviteCode, createTeamMember, type AuthRole } from "@/lib/members/storage";
import { ref, set } from "firebase/database";
import { getDB } from "@/lib/firebase";

export default function SignupPage() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    const normalizedCode = code.trim().toUpperCase();

    // ── Step 1: Validate invite code ──────────────────────────────────────────
    // Reads the specific code directly (inviteCodes/{code}) so the signup page
    // can verify without needing auth to list the entire inviteCodes collection.
    let inviteRole: AuthRole = "member";
    try {
      const invite = await getInviteCodeByValue(normalizedCode);
      if (!invite)                                   { setError("Invalid invite code."); setLoading(false); return; }
      if (new Date(invite.expiresAt) < new Date())   { setError("This invite code has expired."); setLoading(false); return; }
      inviteRole = invite.role;
    } catch {
      setError("Could not verify invite code. Please try again or contact an admin.");
      setLoading(false);
      return;
    }

    // ── Step 2: Create Firebase Auth account ──────────────────────────────────
    let uid: string;
    try {
      const cred = await signUp(email.trim().toLowerCase(), password);
      uid = cred.user.uid;
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === "auth/email-already-in-use")  setError("An account with this email already exists. Sign in instead.");
      else if (errCode === "auth/invalid-email")     setError("Please enter a valid email address.");
      else if (errCode === "auth/operation-not-allowed") setError("Email/password sign-up is not enabled. Contact an admin.");
      else if (errCode === "auth/weak-password")     setError("Password is too weak. Use at least 6 characters.");
      else                                           setError("Account creation failed. Please try again.");
      setLoading(false);
      return;
    }

    // ── Step 3: Write user profile ────────────────────────────────────────────
    // Non-fatal: if this fails (e.g. DB rules), authContext will create a default
    // "member" profile on first login. Admin can then manually set the correct role.
    try {
      const db = getDB();
      if (db) {
        await set(ref(db, `userProfiles/${uid}`), {
          email:     email.trim().toLowerCase(),
          authRole:  inviteRole,
          name:      name.trim(),
          active:    true,
          createdAt: new Date().toISOString(),
        });
      }
    } catch { /* non-fatal */ }

    // ── Step 4: Add to team members database ──────────────────────────────────
    // Non-fatal: creates a team entry so the member shows up in the Team tab
    // immediately without needing manual entry by an admin.
    try {
      const teamRole = inviteRole === "project_lead" ? "Team Lead" : "Member";
      await createTeamMember({
        name:        name.trim(),
        email:       email.trim().toLowerCase(),
        role:        teamRole,
        status:      "Active",
        joinDate:    new Date().toISOString().split("T")[0],
        school:      "",
        divisions:   [],
        pod:         "",
        slackHandle: "",
        skills:      [],
        notes:       "",
      });
    } catch { /* non-fatal */ }

    // ── Step 4: Mark invite code as used ──────────────────────────────────────
    // Non-fatal: new members don't have write access to inviteCodes. The code
    // appears unused in admin, but the account is created with the correct role.
    // Admin can delete the code manually after verifying the account was created.
    try {
      await updateInviteCode(normalizedCode, {
        used:   true,
        usedBy: email.trim().toLowerCase(),
        usedAt: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }

    router.replace("/members/projects");
  };

  return (
    <div className="min-h-screen bg-[#0F1014] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo.png" alt="Volta" width={48} height={48} className="object-contain mb-4" />
          <h1 className="font-display font-bold text-white text-2xl">Create Account</h1>
          <p className="text-white/40 text-sm mt-1">You need an invite code to join.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#1C1F26] border border-white/8 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
              Invite Code
            </label>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#85CC17]/50 transition-colors font-mono uppercase tracking-widest"
              placeholder="VOLTA-XXXXXX"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#85CC17]/50 transition-colors"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#85CC17]/50 transition-colors"
              placeholder="you@email.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#85CC17]/50 transition-colors"
              placeholder="Min. 6 characters"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
              Confirm Password
            </label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#85CC17]/50 transition-colors"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#85CC17] text-[#0D0D0D] font-display font-bold py-3 rounded-xl hover:bg-[#72b314] transition-colors disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="text-center mt-4 text-sm font-body">
          <Link href="/members/login" className="text-white/40 hover:text-white/70 transition-colors">
            Already have an account? Sign in →
          </Link>
        </p>
      </div>
    </div>
  );
}

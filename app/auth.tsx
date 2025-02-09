"use client";
import { useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage("Check your email for the login link!");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
      <form onSubmit={handleLogin} className="flex flex-col space-y-4">
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-4 py-2 rounded border"
        />
        <button type="submit" className="px-4 py-2 bg-white text-black rounded">
          Sign In
        </button>
      </form>
      {message && <p className="mt-4">{message}</p>}
    </div>
  );
}
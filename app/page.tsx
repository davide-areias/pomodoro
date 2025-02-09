"use client"
import { useState, useEffect, useRef } from "react";
import { supabase } from "../app/lib/supabaseClient";
import Auth from "./auth";

export default function PomodoroApp() {
  // Supabase session state
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => {
      listener.subscription?.unsubscribe();
    };
  }, []);

  // Timer durations (in minutes)
  const [workTime, setWorkTime] = useState(30);
  const [breakTime, setBreakTime] = useState(5);
  // Timer in seconds
  const [currentTime, setCurrentTime] = useState(workTime * 60);
  // Mode can be "idle", "work", "finishedWork", or "break"
  const [mode, setMode] = useState<"idle" | "work" | "finishedWork" | "break">("idle");
  // For opening the settings modal
  const [isEditing, setIsEditing] = useState(false);

  // Pomodoro count state
  const [pomodoroCount, setPomodoroCount] = useState(0);

  // Fetch the current pomodoro count for the signed-in user
  async function fetchPomodoroCount() {
    if (!session) return;
    const { count, error } = await supabase
      .from("pomodoros")
      .select("*", { count: "exact", head: true })
      .eq("email", session.user.email);
    if (!error) {
      setPomodoroCount(count || 0);
    }
  }

  useEffect(() => {
    if (session) {
      fetchPomodoroCount();
    }
  }, [session]);

  // Record a completed pomodoro cycle by inserting a record with the user's email.
  async function recordPomodoro() {
    if (!session) return;
    const { error } = await supabase
      .from("pomodoros")
      .insert({ email: session.user.email });
    if (error) {
      console.error("Error recording pomodoro:", error);
    } else {
      // Update our local count immediately.
      setPomodoroCount((prev) => prev + 1);
    }
  }

  // Use a ref to track the previous mode.
  const prevModeRef = useRef(mode);
  useEffect(() => {
    // When transitioning from break back to idle, a cycle is complete.
    if (prevModeRef.current === "break" && mode === "idle") {
      recordPomodoro();
    }
    prevModeRef.current = mode;
  }, [mode]);

  // Reset the timer (work phase) when in "idle" mode and workTime changes
  useEffect(() => {
    if (mode === "idle") {
      setCurrentTime(workTime * 60);
    }
  }, [workTime, mode]);

  // Timer countdown logic (for both work and break phases)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (mode === "work" || mode === "break") {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev > 0) return prev - 1;
          else {
            // Timer reached zero: if we were in work mode, move to finishedWork
            if (mode === "work") {
              setMode("finishedWork");
            } else if (mode === "break") {
              // For break phase, simply return to idle (the user can start a new cycle)
              setMode("idle");
            }
            if (interval) clearInterval(interval);
            return 0;
          }
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mode]);

  // Start work timer from idle
  const startWork = () => {
    if (mode === "idle") {
      setMode("work");
    }
  };

  // Start break timer once work is finished
  const startBreak = () => {
    if (mode === "finishedWork") {
      setCurrentTime(breakTime * 60);
      setMode("break");
    }
  };

  // Helper to format the timer (mm:ss)
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Show the sign-in flow if not authenticated.
  if (!session) {
    return <Auth />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white">
      <h1 className="text-4xl font-bold mb-8">Pomodoro Timer</h1>
      <div className="mb-4">Pomodoros Completed: {pomodoroCount}</div>
      {/* Timer display is clickable (opens settings) only when idle */}
      <div
        onClick={() => mode === "idle" && setIsEditing(true)}
        className="text-8xl font-mono cursor-pointer select-none"
      >
        {formatTime(currentTime)}
      </div>

      {/* Render different buttons/messages depending on the mode */}
      {mode === "idle" && (
        <button
          className="mt-8 px-6 py-2 bg-white text-black rounded-full hover:scale-105 transition-transform"
          onClick={startWork}
        >
          Start
        </button>
      )}

      {mode === "finishedWork" && (
        <div className="mt-8 flex flex-col items-center">
          <div className="animate-bounce text-2xl mb-4">Work complete! Time for a break!</div>
          <button
            className="px-8 py-4 bg-gradient-to-r from-green-500 to-teal-500 rounded-full text-2xl hover:scale-105 transition-transform"
            onClick={startBreak}
          >
            Start Pause
          </button>
        </div>
      )}

      {mode === "work" && <div className="mt-8 text-2xl">Focus!</div>}
      {mode === "break" && <div className="mt-8 text-2xl">Break Time</div>}

      {/* Modal for editing timer durations (visible only in idle mode) */}
      {isEditing && mode === "idle" && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50">
          <div className="bg-gray-900 p-6 rounded-lg space-y-4">
            <h2 className="text-xl font-semibold">Set Timer Durations</h2>
            <div>
              <label className="block mb-2">Work Duration</label>
              <div className="flex space-x-2">
                {[1, 30, 45, 60].map((duration) => (
                  <button
                    key={duration}
                    className={`px-4 py-2 rounded ${
                      workTime === duration ? "bg-white text-black" : "bg-gray-700 text-white"
                    }`}
                    onClick={() => setWorkTime(duration)}
                  >
                    {duration} min
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block mb-2">Break Duration</label>
              <div className="flex space-x-2">
                {[1, 5, 10, 15, 20].map((duration) => (
                  <button
                    key={duration}
                    className={`px-4 py-2 rounded ${
                      breakTime === duration ? "bg-white text-black" : "bg-gray-700 text-white"
                    }`}
                    onClick={() => setBreakTime(duration)}
                  >
                    {duration} min
                  </button>
                ))}
              </div>
            </div>
            <button
              className="mt-4 px-6 py-2 bg-blue-500 rounded hover:bg-blue-600 transition-colors"
              onClick={() => setIsEditing(false)}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
"use client"
import { useState, useEffect, useRef, useCallback } from "react";
import confetti from "canvas-confetti";
import { supabase } from "../app/lib/supabaseClient";
import Auth from "./auth";
import type { Session } from "@supabase/supabase-js";

export default function PomodoroApp() {
  // Supabase session state
  const [session, setSession] = useState<Session | null>(null);
  // Loading state until session is determined.
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsSessionLoading(false);
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

  // Timer in seconds and mode state.
  const [currentTime, setCurrentTime] = useState(workTime * 60);
  const [mode, setMode] = useState<"idle" | "work" | "finishedWork" | "break">("idle");

  // For opening the settings modal
  const [isEditing, setIsEditing] = useState(false);
  // State for settings saving loading spinner.
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Pomodoro count state – this now controls both the counter display and the number of oranges.
  const [pomodoroCount, setPomodoroCount] = useState(0);

  // Absolute end timestamp (in milliseconds)
  const [endTime, setEndTime] = useState<number | null>(null);

  // Create a ref for the Start button.
  const startButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch pomodoro count from DB for logged-in user.
  const fetchPomodoroCount = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from("pomodoros")
      .select("count")
      .eq("user_id", session.user.id);
    if (error) {
      console.error("Error fetching pomodoro count:", error.message);
    } else if (data && data.length > 0) {
      setPomodoroCount(data[0].count);
    } else {
      setPomodoroCount(0);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      fetchPomodoroCount();
    }
  }, [fetchPomodoroCount, session]);

  // Initialize pomodoro row if needed.
  useEffect(() => {
    if (session) {
      const initPomodoroRow = async () => {
        // Check if a record already exists.
        const { data, error: selectError } = await supabase
          .from("pomodoros")
          .select("user_id")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (selectError) {
          console.error("Error checking pomodoro row:", selectError.message);
          return;
        }

        // If no record, then insert one.
        if (!data) {
          const { error: insertError } = await supabase
            .from("pomodoros")
            .insert([{ email: session.user.email, user_id: session.user.id, count: 0 }]);
          if (insertError) {
            console.error("Error inserting pomodoro row:", insertError.message);
          }
        }
      };

      initPomodoroRow();
    }
  }, [session]);

  // Initialize or fetch user settings.
  useEffect(() => {
    if (session) {
      const initUserSettings = async () => {
        const { data, error } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (error) {
          console.error("Error fetching user settings:", error.message);
        } else if (data) {
          setWorkTime(data.focus_time);
          setBreakTime(data.interval_time);
          setCurrentTime(data.focus_time * 60);
        } else {
          const { error: insertError } = await supabase
            .from("user_settings")
            .upsert(
              { user_id: session.user.id, focus_time: workTime, interval_time: breakTime },
              { onConflict: "user_id" }
            );
          if (insertError) {
            console.error("Error initializing user settings:", insertError.message);
          }
        }
      };

      initUserSettings();
    }
  }, [session, workTime, breakTime]);

  // Update user settings in the DB.
  async function updateUserSettings() {
    if (!session) return;
    const { error } = await supabase
      .from("user_settings")
      .update({ focus_time: workTime, interval_time: breakTime })
      .eq("user_id", session.user.id);
    if (error) {
      console.error("Error updating user settings:", error.message);
    }
  }

  // Save settings handler called on modal save.
  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    await updateUserSettings();
    setSettingsSaving(false);
    setIsEditing(false);
    // If in idle mode, reset currentTime based on updated workTime.
    if (mode === "idle") {
      setCurrentTime(workTime * 60);
    }
  };

  // Record pomodoro in the DB when a full cycle is completed.
  const recordPomodoro = useCallback(async () => {
    if (!session) return;
    const { error } = await supabase
      .from("pomodoros")
      .update({ count: pomodoroCount + 1 })
      .eq("user_id", session.user.id);
    if (error) {
      console.error("Error recording pomodoro:", error.message);
    } else {
      setPomodoroCount((prev) => prev + 1);
    }
  }, [session, pomodoroCount]);

  // Helper: Launch confetti using canvas-confetti.
  const launchConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  // Add vibration permission state.
  const [vibrationEnabled, setVibrationEnabled] = useState(false);

  // Request vibration "permission" by triggering a short vibration.
  const requestVibrationPermission = () => {
    if (navigator.vibrate) {
      // A brief vibration to allow future, programmatic vibrations.
      navigator.vibrate(50);
      setVibrationEnabled(true);
    } else {
      console.warn("Vibration API is not supported on this device.");
    }
  };

  // Use a ref to track the previous mode.
  const prevModeRef = useRef(mode);
  useEffect(() => {
    // When work finishes, launch confetti and trigger 3 vibration pulses.
    if (mode === "finishedWork") {
      launchConfetti();
      if (vibrationEnabled && navigator.vibrate) {
        // Vibrate pattern: vibration, pause, repeated 3 times.
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
    }
    // When transitioning from break back to idle, complete the cycle.
    if (prevModeRef.current === "break" && mode === "idle") {
      recordPomodoro();
      launchConfetti();
    }
    prevModeRef.current = mode;
  }, [mode, recordPomodoro, vibrationEnabled]);

  // Reset the timer when in idle mode and workTime changes.
  useEffect(() => {
    if (mode === "idle") {
      setCurrentTime(workTime * 60);
    }
  }, [workTime, mode]);

  // Start work: record an absolute ending time.
  const startWork = () => {
    if (mode === "idle") {
      const newEnd = Date.now() + workTime * 60 * 1000;
      setEndTime(newEnd);
      setMode("work");
    }
  };

  // Start break.
  const startBreak = () => {
    if (mode === "finishedWork") {
      const newEnd = Date.now() + breakTime * 60 * 1000;
      setEndTime(newEnd);
      setMode("break");
    }
  };

  // Timer countdown logic.
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if ((mode === "work" || mode === "break") && endTime !== null) {
      interval = setInterval(() => {
        const secondsLeft = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        setCurrentTime(secondsLeft);
        if (secondsLeft === 0) {
          if (interval !== null) clearInterval(interval);
          if (mode === "work") {
            setMode("finishedWork");
          } else if (mode === "break") {
            setMode("idle");
          }
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mode, endTime]);

  // Helper to format the timer (mm:ss).
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Show a full-screen loader while checking the session.
  if (isSessionLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="w-12 h-12 border-t-4 border-blue-500 border-solid rounded-full animate-spin"></div>
      </div>
    );
  }

  // Show the sign-in page if not authenticated.
  if (!session) {
    return <Auth />;
  }

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-black text-white">
      {/* Fixed orange counter display */}
      <div className="absolute top-4 left-4 flex items-center space-x-2">
        <img src="/orange.png" alt="Orange" className="w-8 h-8" />
        <span className="text-2xl">{pomodoroCount}</span>
      </div>

      <h1 className="text-4xl font-bold mb-8">Pomodoro Timer</h1>
      <div
        onClick={() => mode === "idle" && setIsEditing(true)}
        className="text-8xl font-mono cursor-pointer select-none"
      >
        {formatTime(currentTime)}
      </div>
      {mode === "idle" && (
        <button
          ref={startButtonRef}
          className="mt-8 px-6 py-2 bg-white text-black rounded-full hover:scale-105 transition-transform"
          onClick={startWork}
        >
          Start
        </button>
      )}
      {mode === "finishedWork" && (
        <div className="mt-8 flex flex-col items-center">
          <div className="animate-bounce text-2xl mb-4">
            Work complete! Time for a break!
          </div>
          <button
            className="mt-8 px-6 py-2 bg-white text-black rounded-full hover:scale-105 transition-transform"
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
              <label className="block mb-2">Work/Focus Duration</label>
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
              <label className="block mb-2">Break/Interval Duration</label>
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
              disabled={settingsSaving}
              className="mt-4 px-6 py-2 bg-blue-500 rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
              onClick={handleSaveSettings}
            >
              {settingsSaving ? (
                <div className="flex items-center justify-center">
                  <div className="w-6 h-6 border-t-4 border-blue-300 rounded-full animate-spin"></div>
                </div>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Optionally display "Enable Vibration" if not yet enabled */}
      {!vibrationEnabled && (
        <button
          onClick={requestVibrationPermission}
          className="absolute bottom-4 left-4 px-4 py-2 bg-green-500 text-black rounded-full hover:scale-105 transition-transform"
        >
          Enable Vibration
        </button>
      )}
      
      {/* Pass the start button ref into the OrangePhysics component */}
      <OrangePhysics count={pomodoroCount} startButtonRef={startButtonRef} />
    </div>
  );
}

// -------------------------------------------------------------------
// OrangePhysics component
// This component renders as many orange images (from public/orange.png)
// as the current pomodoro count and simulates them moving around under
// physics (with acceleration coming from the device's orientation).
// -------------------------------------------------------------------

function OrangePhysics({
  count,
  startButtonRef
}: {
  count: number;
  startButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const orangeSize = 70; // Use this variable to set the size of each orange.
  const containerRef = useRef<HTMLDivElement>(null);
  const [oranges, setOranges] = useState<
    { id: number; x: number; y: number; vx: number; vy: number }[]
  >([]);
  const domRefs = useRef(new Map<number, HTMLImageElement>());
  const accelRef = useRef({ ax: 0, ay: 0 });
  const [motionPermissionGranted, setMotionPermissionGranted] = useState(false);
  const [needsMotionPermission, setNeedsMotionPermission] = useState(false);

  interface DeviceOrientationEventConstructorWithPermission
    extends DeviceOrientationEventInit {
    requestPermission?: () => Promise<"granted" | "denied">;
  }

  // Cast DeviceOrientationEvent to the extended interface.
  const DeviceOrientationEventWithPermission = DeviceOrientationEvent as DeviceOrientationEventConstructorWithPermission;

  const handleDeviceOrientation = useCallback((event: DeviceOrientationEvent) => {
    const gamma = event.gamma || 0; // left-to-right tilt in degrees
    const beta = event.beta || 0;  // front-to-back tilt in degrees
    const sensitivity = 3; // Adjust sensitivity as needed
    accelRef.current = {
      ax: gamma * sensitivity,
      ay: beta * sensitivity,
    };
  }, []);

  useEffect(() => {
    // If the requestPermission method exists, we assume a permission prompt is required (iOS).
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEventWithPermission.requestPermission === "function"
    ) {
      setNeedsMotionPermission(true);
    } else {
      // On Android and other devices that don't require explicit permission, add the event listener immediately.
      window.addEventListener("deviceorientation", handleDeviceOrientation, true);
    }
    return () => {
      window.removeEventListener("deviceorientation", handleDeviceOrientation, true);
    };
  }, [handleDeviceOrientation]);

  // Updated function to request permission (this will only be invoked on devices that require it, such as iOS).
  const requestMotionPermission = async () => {
    try {
      // The non-null assertion tells TypeScript that requestPermission exists here.
      const permission = await DeviceOrientationEventWithPermission.requestPermission!();
      if (permission === "granted") {
        setMotionPermissionGranted(true);
        setNeedsMotionPermission(false);
        window.addEventListener("deviceorientation", handleDeviceOrientation, true);
      }
    } catch (error) {
      console.error("Device orientation permission error:", error);
    }
  };

  // Update oranges state when the count changes.
  useEffect(() => {
    const container = containerRef.current;
    const containerWidth = container?.clientWidth || window.innerWidth;
    const containerHeight = container?.clientHeight || window.innerHeight;
    if (count > oranges.length) {
      const numToAdd = count - oranges.length;
      const newOranges: { id: number; x: number; y: number; vx: number; vy: number }[] = [];
      for (let i = 0; i < numToAdd; i++) {
        newOranges.push({
          id: Date.now() + i,
          x: Math.random() * (containerWidth - orangeSize),
          y: Math.random() * (containerHeight - orangeSize),
          vx: 0,
          vy: 0,
        });
      }
      setOranges((prev) => [...prev, ...newOranges]);
    } else if (count < oranges.length) {
      setOranges((prev) => prev.slice(0, count));
    }
  }, [count, oranges.length, orangeSize]);

  // Physics animation loop.
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    const velocityBoost = 1.5; // Increase acceleration magnitude.
    const update = (time: number) => {
      const dt = (time - lastTime) / 1000; // seconds
      lastTime = time;
      const container = containerRef.current;
      const containerWidth = container?.clientWidth || window.innerWidth;
      const containerHeight = container?.clientHeight || window.innerHeight;
      const size = orangeSize; // consistently use orangeSize for boundaries
      
      // Use sensor data if available; otherwise, default to an increased downward acceleration.
      const defaultAccel = { ax: 0, ay: 500 };
      const accel =
        (needsMotionPermission && !motionPermissionGranted) || !window.DeviceOrientationEvent
          ? defaultAccel
          : { ax: accelRef.current.ax * velocityBoost, ay: accelRef.current.ay * velocityBoost };

      setOranges((prevOranges) => {
        // 1. Update positions with acceleration and boundary collision check.
        const newOranges = prevOranges.map((orange) => {
          let { x, y, vx, vy } = orange;
          vx += accel.ax * dt;
          vy += accel.ay * dt;
          x += vx * dt;
          y += vy * dt;

          if (x < 0) {
            x = 0;
            vx = -vx * 0.8;
          } else if (x + size > containerWidth) {
            x = containerWidth - size;
            vx = -vx * 0.8;
          }
          if (y < 0) {
            y = 0;
            vy = -vy * 0.8;
          } else if (y + size > containerHeight) {
            y = containerHeight - size;
            vy = -vy * 0.8;
          }
          vx *= 0.99;
          vy *= 0.99;
          return { ...orange, x, y, vx, vy };
        });

        // 2. (Optional) Perform pairwise collision checks if needed.

        // 3. Update the DOM element positions accordingly.
        newOranges.forEach((orange) => {
          const el = domRefs.current.get(orange.id);
          if (el) {
            el.style.transform = `translate(${orange.x}px, ${orange.y}px)`;
          }
        });
        return newOranges;
      });
      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [orangeSize, motionPermissionGranted, needsMotionPermission]);

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none">
      {oranges.map((orange) => (
        <img
          key={orange.id}
          ref={(el) => {
            if (el) {
              domRefs.current.set(orange.id, el);
              el.style.transform = `translate(${orange.x}px, ${orange.y}px)`;
              el.style.position = "absolute";
              el.style.width = `${orangeSize}px`;
              el.style.height = `${orangeSize}px`;
            }
          }}
          src="/orange.png"
          alt="orange"
        />
      ))}
      {needsMotionPermission && (
        <div className="absolute bottom-4 right-4 pointer-events-auto">
          <button
            onClick={requestMotionPermission}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Enable Motion
          </button>
        </div>
      )}
    </div>
  );
}
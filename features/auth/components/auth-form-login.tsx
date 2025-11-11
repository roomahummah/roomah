// features/auth/components/auth-form-login.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginData } from "@/features/auth/schemas/login";
import { signIn, startGoogleOAuth } from "@/server/actions/auth";

export function AuthFormLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Check for error in URL params (from OAuth callback)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlError = params.get('message');
      if (urlError) {
        setError(decodeURIComponent(urlError));
        // Clean URL without triggering navigation
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginData) {
    setIsLoading(true);
    setError("");
    try {
      const res = await signIn(data.email, data.password);
      if (res.success) {
        const usp = new URLSearchParams(window.location.search);
        const next = usp.get("next") || "/cari-jodoh";
        
        // CRITICAL: Use window.location for full page reload
        // This ensures cookies are properly set and middleware processes the session
        window.location.href = next;
      } else {
        setError(res.error || "Gagal login. Periksa email dan password Anda.");
      }
    } catch (e: any) {
      setError(e?.message || "Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setIsLoading(true);
    setError("");
    try {
      const res = await startGoogleOAuth("login");
      if (res.success && res.url) {
        // Arahkan user ke Google OAuth
        window.location.href = res.url;
      } else {
        setError(res.error || "Gagal memulai Google OAuth");
        setIsLoading(false);
      }
    } catch (e: any) {
      setError(e?.message || "Terjadi kesalahan. Silakan coba lagi.");
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
          <p
            className="text-sm text-destructive"
            role="alert"
            aria-live="polite"
          >
            {error}
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-card-foreground mb-2"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            {...register("email")}
            className="w-full"
            placeholder="nama@email.com"
            disabled={isLoading}
          />
          {errors.email && (
            <p className="text-sm text-destructive mt-1">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-card-foreground mb-2"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            {...register("password")}
            className="w-full"
            placeholder="Password Anda"
            disabled={isLoading}
          />
          {errors.password && (
            <p className="text-sm text-destructive mt-1">
              {errors.password.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary text-primary-foreground rounded-md px-4 py-3 font-medium hover:bg-primary/90 focus-visible:ring-ring disabled:opacity-50"
        >
          {isLoading ? "Memproses..." : "Masuk"}
        </button>

        {/* TOMBOL GOOGLE — UI TETAP, kini berfungsi */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full bg-muted text-muted-foreground border border-input rounded-md px-4 py-3 font-medium hover:bg-muted/80 focus-visible:ring-ring disabled:opacity-50"
        >
          Masuk dengan Google
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  registerSchema,
  type RegisterData,
} from "@/features/auth/schemas/register";
import { signUp, startGoogleOAuth } from "@/server/actions/auth";
import { TermsModal } from "./terms-modal";
import { PrivacyModal } from "./privacy-modal";

export function AuthFormRegister() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for error in URL params (from OAuth callback)
  useEffect(() => {
    const urlError = searchParams.get("message");
    if (urlError) {
      setError(decodeURIComponent(urlError));
      // Clean URL
      router.replace("/register");
    }
  }, [searchParams, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(data: RegisterData) {
    setIsLoading(true);
    setError("");

    try {
      const result = await signUp({
        email: data.email,
        password: data.password,
        fullName: "", // Will be set during onboarding
      });

      if (result.success) {
        if (result.status === "signed_in") {
          // CRITICAL: Use window.location for full page reload
          // This ensures cookies are properly set and middleware processes the session
          window.location.href = "/onboarding/verifikasi";
        } else {
          // needs_verification
          setError(""); // bukan error—info
          // (opsional) tampilkan banner info bahwa tautan verifikasi sudah dikirim
        }
      } else {
        setError(result.message || "Terjadi kesalahan saat mendaftar");
      }
    } catch (err) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setIsLoading(true);
    setError("");
    try {
      const res = await startGoogleOAuth("register");
      if (res.success && res.url) {
        // Arahkan user ke halaman Google OAuth
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
            <p
              className="text-sm text-destructive mt-1"
              role="alert"
              aria-live="polite"
            >
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
            placeholder="Minimal 8 karakter"
            disabled={isLoading}
          />
          {errors.password && (
            <p
              className="text-sm text-destructive mt-1"
              role="alert"
              aria-live="polite"
            >
              {errors.password.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-card-foreground mb-2"
          >
            Konfirmasi Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            {...register("confirmPassword")}
            className="w-full"
            placeholder="Ulangi password Anda"
            disabled={isLoading}
          />
          {errors.confirmPassword && (
            <p
              className="text-sm text-destructive mt-1"
              role="alert"
              aria-live="polite"
            >
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <div className="flex items-start space-x-3">
          <input
            id="agree"
            type="checkbox"
            {...register("agree")}
            className="mt-1 w-4 h-4 rounded border-input"
            disabled={isLoading}
          />
          <label htmlFor="agree" className="text-sm text-card-foreground">
            Saya setuju dengan{" "}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowTermsModal(true);
              }}
              className="text-link hover:underline font-medium"
            >
              Syarat dan Ketentuan
            </button>{" "}
            serta{" "}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowPrivacyModal(true);
              }}
              className="text-link hover:underline font-medium"
            >
              Kebijakan Privasi
            </button>{" "}
            Roomah
          </label>
        </div>
        {errors.agree && (
          <p
            className="text-sm text-destructive"
            role="alert"
            aria-live="polite"
          >
            {errors.agree.message}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary text-primary-foreground rounded-md px-4 py-3 font-medium hover:bg-primary/90 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
        >
          {isLoading ? "Mendaftar..." : "Daftar"}
        </button>

        <button
          type="button"
          onClick={handleGoogleSignUp}
          disabled={isLoading}
          className="w-full bg-muted text-muted-foreground border border-input rounded-md px-4 py-3 font-medium hover:bg-muted/80 focus-visible:ring-ring disabled:opacity-50"
        >
          Daftar dengan Google
        </button>
      </div>

      {/* Modals */}
      <TermsModal open={showTermsModal} onOpenChange={setShowTermsModal} />
      <PrivacyModal open={showPrivacyModal} onOpenChange={setShowPrivacyModal} />
    </form>
  );
}

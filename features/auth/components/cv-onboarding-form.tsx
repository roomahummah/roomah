"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  onboardingCvWajibSchema,
  type OnboardingCvWajibInput,
} from "@/features/auth/schemas/onboarding";
import { submitOnboardingCvWajib, skipOnboardingCv } from "@/features/auth/server/actions";
import { useAuth } from "@/lib/contexts/AuthContext";

// ⬇️ Sumber data dipusatkan di constants
import {
  INDONESIAN_PROVINCES,
  EDUCATION_LEVELS,
  MARITAL_STATUSES,
  INCOME_RANGES,
} from "@/lib/constants/regions";

// hitung umur dari YYYY-MM-DD (jika ada)
function calcAge(birthDate?: string) {
  if (!birthDate) return undefined;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return undefined;
  const now = new Date();  const age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 ? age : undefined;
}

export function CvOnboardingForm() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingCvWajibInput>({
    resolver: zodResolver(onboardingCvWajibSchema),
  });

  async function onSubmit(data: OnboardingCvWajibInput) {
    setIsLoading(true);
    
    try {
      // submitOnboardingCvWajib will get user from server session
      // Pass null as userId to let server action get it from session
      const result = await submitOnboardingCvWajib(null, data);

      if (result.success) {
        // CRITICAL: Use window.location for full page reload
        // This ensures cookies are properly set and middleware processes the session
        window.location.href = "/onboarding/selesai";
      } else {
        console.error(result.error);
        // TODO: Show toast error
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSkip() {
    setIsLoading(true);
    try {
      // skipOnboardingCv will get user from server session
      const result = await skipOnboardingCv(null);
      
      if (result.success) {
        // CRITICAL: Use window.location for full page reload
        // This ensures cookies are properly set and middleware processes the session
        window.location.href = "/onboarding/selesai";
      } else {
        console.error(result.error);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Jenis Kelamin */}
        <div>
          <label
            htmlFor="gender"
            className="block text-sm font-medium text-card-foreground mb-2"
          >
            Jenis Kelamin *
          </label>
          <select
            id="gender"
            {...register("gender")}
            className="w-full"
            disabled={isLoading}
          >
            <option value="">Pilih Jenis Kelamin</option>
            <option value="IKHWAN">Ikhwan (Laki-laki)</option>
            <option value="AKHWAT">Akhwat (Perempuan)</option>
          </select>
          {errors.gender && (
            <p
              className="text-sm text-destructive mt-1"
              role="alert"
              aria-live="polite"
            >
              {errors.gender.message}
            </p>
          )}
        </div>
        {/* Tanggal Lahir */}
        <div>
          <label
            htmlFor="birthDate"
            className="block text-sm font-medium text-card-foreground mb-2"
          >
            Tanggal Lahir *
          </label>
          <input
            id="birthDate"
            type="date"
            {...register("birthDate")}
            className="w-full"
            disabled={isLoading}
          />
          {errors.birthDate && (
            <p
              className="text-sm text-destructive mt-1"
              role="alert"
              aria-live="polite"
            >
              {errors.birthDate.message}
            </p>
          )}
        </div>

        {/* Domisili Provinsi */}
        <div>
          <label
            htmlFor="provinceId"
            className="block text-sm font-medium text-card-foreground mb-2"
          >
            Domisili Provinsi *
          </label>
          <select
            id="provinceId"
            {...register("provinceId", { valueAsNumber: true })}
            className="w-full"
            disabled={isLoading}
          >
            <option value="">Pilih Provinsi</option>
            {INDONESIAN_PROVINCES.map((prov, idx) => (
              <option key={idx} value={idx + 1}>
                {prov}
              </option>
            ))}
          </select>
          {errors.provinceId && (
            <p
              className="text-sm text-destructive mt-1"
              role="alert"
              aria-live="polite"
            >
              {errors.provinceId.message}
            </p>
          )}
        </div>

        {/* Pendidikan */}
        <div>
          <label
            htmlFor="education"
            className="block text-sm font-medium text-card-foreground mb-2"
          >
            Pendidikan *
          </label>
          <select
            id="education"
            {...register("education")}
            className="w-full"
            disabled={isLoading}
          >
            <option value="">Pilih Pendidikan</option>
            <option value="SMA_SMK">SMA/SMK</option>
            <option value="D3">D3</option>
            <option value="S1">S1</option>
            <option value="S2">S2</option>
            <option value="S3">S3</option>
          </select>
          {errors.education && (
            <p
              className="text-sm text-destructive mt-1"
              role="alert"
              aria-live="polite"
            >
              {errors.education.message}
            </p>
          )}
        </div>

        {/* Pekerjaan */}
        <div>
          <label
            htmlFor="occupation"
            className="block text-sm font-medium text-card-foreground mb-2"
          >
            Pekerjaan *
          </label>
          <input
            id="occupation"
            type="text"
            {...register("occupation")}
            className="w-full"
            placeholder="Contoh: Software Engineer"
            disabled={isLoading}
          />
          {errors.occupation && (
            <p
              className="text-sm text-destructive mt-1"
              role="alert"
              aria-live="polite"
            >
              {errors.occupation.message}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between pt-6">
        <button
          type="button"
          onClick={handleSkip}
          disabled={isLoading}
          className="w-full sm:w-auto px-6 py-2.5 text-sm sm:text-base text-muted-foreground hover:text-card-foreground border border-input rounded-md disabled:opacity-50 order-2 sm:order-1"
        >
          Lewati
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full sm:w-auto bg-primary text-primary-foreground rounded-md px-6 py-2.5 text-sm sm:text-base font-medium hover:bg-primary/90 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none order-1 sm:order-2"
        >
          {isLoading ? "Menyimpan..." : "Simpan & Lanjutkan"}
        </button>
      </div>
    </form>
  );
}

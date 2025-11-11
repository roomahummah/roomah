"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fiveQSchema, type FiveQData } from "@/features/auth/schemas/fiveq";
import { NegativeGateModal } from "./negative-gate-modal";
import { saveVerification } from "@/server/actions/onboarding";

const questions = [
  "Apakah Anda sudah siap secara mental dan spiritual untuk menjalani Ta'aruf?",
  "Apakah Anda memiliki tujuan yang jelas untuk menikah dalam waktu dekat (1-2 tahun)?",
  "Apakah Anda memiliki kesiapan finansial untuk berkeluarga?",
  "Apakah Anda sudah mendapat restu dari keluarga untuk mencari pasangan hidup?",
  "Apakah Anda siap berkomitmen penuh dalam proses Ta'aruf yang serius?",
];

export function FiveQForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [negativeCount, setNegativeCount] = useState(0);
  const [pendingData, setPendingData] = useState<{
    q1: boolean;
    q2: boolean;
    q3: boolean;
    q4: boolean;
    q5: boolean;
  } | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FiveQData>({ resolver: zodResolver(fiveQSchema) });

  // helper normalisasi (radio mengirim "true"/"false" sebagai string)
  const toBool = (v: unknown) => v === true || v === "true";

  function countNegativeAnswers(data: FiveQData): number {
    return Object.values(data).filter((v) => !toBool(v)).length;
  }

  async function onSubmit(raw: FiveQData) {
    setIsLoading(true);
    try {
      // normalisasi payload ke boolean
      const payload = {
        q1: toBool(raw.q1),
        q2: toBool(raw.q2),
        q3: toBool(raw.q3),
        q4: toBool(raw.q4),
        q5: toBool(raw.q5),
      };

      const negatives = countNegativeAnswers(raw);
      setNegativeCount(negatives);

      if (negatives > 0) {
        // Ada jawaban negatif - simpan data sementara dan tampilkan modal
        setPendingData(payload);
        setShowModal(true);
        setIsLoading(false);
        return;
      }

      // Semua jawaban positif - simpan langsung tanpa committed flag
      const result = await saveVerification(payload);
      
      if (!result.success) {
        console.error("Failed to save verification:", result.error);
        alert("Gagal menyimpan verifikasi. Silakan coba lagi.");
        return;
      }

      // Lanjut ke CV
      await proceedToNext();
    } catch (e) {
      console.error(e);
      alert("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  }

  async function proceedToNext() {
    // CRITICAL: Use window.location for full page reload
    // This ensures cookies are properly set and middleware processes the session
    window.location.href = "/onboarding/cv";
  }

  async function handleModalContinue() {
    setShowModal(false);
    setIsLoading(true);
    
    try {
      if (!pendingData) {
        console.error("No pending data to save");
        return;
      }
      
      // Save with committed = true
      const result = await saveVerification({
        ...pendingData,
        committed: true,
      });
      
      if (!result.success) {
        console.error("Failed to save verification:", result.error);
        alert("Gagal menyimpan verifikasi. Silakan coba lagi.");
        setIsLoading(false);
        return;
      }
      
      // Clear pending data
      setPendingData(null);
      
      // Proceed to next step
      await proceedToNext();
    } catch (e) {
      console.error(e);
      alert("Terjadi kesalahan. Silakan coba lagi.");
      setIsLoading(false);
    }
  }

  function handleModalCancel() {
    setShowModal(false);
    setPendingData(null); // Clear pending data
    setIsLoading(false);
    // CRITICAL: Use window.location for full page reload
    window.location.href = "/"; // balik ke home jika user memilih batal
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-6">
          {questions.map((question, index) => {
            const fieldName = `q${index + 1}` as keyof FiveQData;
            return (
              <div key={index} className="space-y-3">
                <p className="text-sm font-medium text-card-foreground">
                  {index + 1}. {question}
                </p>
                <div className="flex space-x-6">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      {...register(fieldName)}
                      value="true"
                      className="w-4 h-4 border-input"
                      disabled={isLoading}
                    />
                    <span className="text-sm text-card-foreground">Ya</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      {...register(fieldName)}
                      value="false"
                      className="w-4 h-4 border-input"
                      disabled={isLoading}
                    />
                    <span className="text-sm text-card-foreground">Tidak</span>
                  </label>
                </div>
                {errors[fieldName] && (
                  <p
                    className="text-sm text-destructive"
                    role="alert"
                    aria-live="polite"
                  >
                    {errors[fieldName]?.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {errors.root && (
          <p
            className="text-sm text-destructive"
            role="alert"
            aria-live="polite"
          >
            {errors.root.message}
          </p>
        )}

        <div className="flex justify-between pt-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 text-muted-foreground hover:text-card-foreground disabled:opacity-50"
            disabled={isLoading}
          >
            Kembali
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-primary text-primary-foreground rounded-md px-6 py-2 font-medium hover:bg-primary/90 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? "Memproses..." : "Lanjut"}
          </button>
        </div>
      </form>

      <NegativeGateModal
        isOpen={showModal}
        onContinue={handleModalContinue}
        onCancel={handleModalCancel}
        negativeCount={negativeCount}
      />
    </>
  );
}

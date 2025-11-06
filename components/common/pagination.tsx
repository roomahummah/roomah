"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";

export interface PaginationProps {
  totalPages: number;
  currentPage: number;
  baseUrl?: string;
}

export function Pagination({
  totalPages,
  currentPage,
  baseUrl = "",
}: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`${baseUrl}?${params.toString()}`, { scroll: false });
    
    // Scroll to candidate section on mobile after page change
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setTimeout(() => {
        // Find the first candidate card or the grid container
        const candidateGrid = document.querySelector('[class*="grid-cols"]');
        if (candidateGrid) {
          const headerOffset = 80; // Account for sticky header
          const elementPosition = candidateGrid.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }, 100); // Small delay to ensure navigation completes
    }
  };

  const renderPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  const end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(
        <Button
          key={i}
          variant={i === currentPage ? "primary" : "outline"}
          size="sm"
          onClick={() => handlePageChange(i)}
          className={
            i === currentPage ? "bg-primary text-primary-foreground" : ""
          }
        >
          {i}
        </Button>
      );
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="mr-2"
      >
        Previous
      </Button>

      {currentPage > 3 && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(1)}
          >
            1
          </Button>
          {currentPage > 4 && <span className="px-2">...</span>}
        </>
      )}

      {renderPageNumbers()}

      {currentPage < totalPages - 2 && (
        <>
          {currentPage < totalPages - 3 && <span className="px-2">...</span>}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(totalPages)}
          >
            {totalPages}
          </Button>
        </>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="ml-2"
      >
        Next
      </Button>
    </div>
  );
}


"use client";

import { useState } from "react";
import { Cross2Icon, ExclamationTriangleIcon } from "@radix-ui/react-icons";

interface BugReportModalProps {
  onClose: () => void;
}

export function BugReportModal({ onClose }: BugReportModalProps) {
  const [title, setTitle] = useState("");
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/github", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          body: comments.trim() || "No additional details provided.",
          labels: ["bug"],
        }),
        redirect: "follow",
      });

      if (!response.ok) {
        if (response.status === 307 || response.status === 308) {
          const location = response.headers.get("Location");
          throw new Error(
            `Redirect to ${location || "unknown location"}. The server may need to be restarted.`,
          );
        }

        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to submit bug report" }));
        throw new Error(
          errorData.error || errorData.detail || `HTTP ${response.status}`,
        );
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
        setTitle("");
        setComments("");
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to submit bug report:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to submit bug report. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="relative w-125 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon
              className="text-white/60"
              width={20}
              height={20}
            />
            <h2 className="text-white font-semibold text-lg">Report a Bug</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
          >
            <Cross2Icon width={16} height={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the bug"
              className="w-full px-4 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm"
              required
              disabled={isSubmitting || success}
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              Details
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Describe the bug, steps to reproduce, expected vs actual behavior..."
              rows={6}
              className="w-full px-4 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm resize-none"
              disabled={isSubmitting || success}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-green-500/20 border border-green-500/50 text-green-200 text-sm">
              Bug report submitted successfully! Closing...
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || success}
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || success || !title.trim()}
              className="flex-1 px-4 py-2.5 rounded-lg bg-white hover:bg-white/90 text-black transition-all text-sm font-medium disabled:opacity-50"
            >
              {isSubmitting
                ? "Submitting..."
                : success
                  ? "Submitted!"
                  : "Submit Bug Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

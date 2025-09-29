import React from "react";
// import * as Dialog from "@radix-ui/react-dialog"; // Dialog removed
import { Id } from "../../convex/_generated/dataModel";
import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom"; // Added
import { toast } from "sonner"; // Corrected import for toast
import { MentionTextarea } from "./ui/MentionTextarea";

interface CommentFormProps {
  onSubmit: (content: string) => void; // Removed author from onSubmit
  parentId?: Id<"comments">;
}

export function CommentForm({ onSubmit, parentId }: CommentFormProps) {
  const [content, setContent] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { isSignedIn, isLoaded: isClerkLoaded } = useUser(); // Get user for author info
  const navigate = useNavigate();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isClerkLoaded) return;

    if (!isSignedIn) {
      toast.error("Please sign in to comment.");
      // It might be better to redirect or show a modal for sign-in
      navigate("/sign-in");
      return;
    }

    // Trim whitespace from the beginning and end of the content
    const trimmedContent = content.trim();

    // Validate character count instead of word count
    if (trimmedContent.length < 10) {
      setError("Comment must be at least 10 characters long.");
      return;
    }
    // Clear any previous error
    setError(null);
    onSubmit(trimmedContent); // Use trimmed content
    setContent(""); // Clear the textarea after submission
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    // Clear error when user starts typing
    if (error && value.trim().length >= 10) {
      setError(null);
    }
  };

  // Placeholder for a sign-in action, adjust as per your app's routing/UI flow
  const handleSignIn = () => {
    navigate("/sign-in");
  };

  const canSubmit = isClerkLoaded && isSignedIn;
  const isContentValid = content.trim().length >= 10;

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-4">
        <MentionTextarea
          value={content}
          onChange={handleContentChange}
          placeholder={
            canSubmit
              ? "Write your comment... (Markdown supported, min. 10 characters, use @username to mention users)"
              : "Sign in to write your comment..."
          }
          className={`min-h-[100px] ${
            error ? "border-red-500 ring-red-500" : ""
          }`}
          rows={4}
          required
          disabled={!canSubmit}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        <div className="mt-2 text-sm text-[#545454]">
          {/* Comments are held for moderation before appearing on the site. */}
        </div>
        <button
          type="submit"
          disabled={!canSubmit || !content.trim() || !isContentValid}
          className="mt-2 px-4 py-2 bg-[#292929] text-white rounded-md hover:bg-[#525252] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400"
          title={
            !canSubmit
              ? "Sign in to comment"
              : !isContentValid && content.trim()
                ? "Comment must be at least 10 characters."
                : undefined
          }
        >
          {parentId ? "Reply" : "Comment"}
        </button>
      </form>

      {!isClerkLoaded && (
        <p className="mt-2 text-sm text-gray-500">Loading user status...</p>
      )}

      {isClerkLoaded && !isSignedIn && (
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
          <p className="text-gray-700">
            Please{" "}
            <button
              onClick={handleSignIn}
              className="text-black hover:underline font-medium focus:outline-none"
            >
              sign in
            </button>{" "}
            or{" "}
            <button
              onClick={handleSignIn}
              className="text-black hover:underline font-medium focus:outline-none"
            >
              sign up
            </button>{" "}
            to leave a comment.
          </p>
        </div>
      )}
    </>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import { ProfileHoverCard } from "../components/ui/ProfileHoverCard";

/**
 * Utility function to render text with @username mentions as clickable links with ProfileHoverCard support
 * Converts @username tokens to links pointing to user profiles with hover cards
 */
export function renderTextWithMentions(text: string): React.ReactNode {
  if (!text) return text;

  // Split text by @username patterns while preserving the matches
  const parts = text.split(/(^|\s)(@[a-zA-Z0-9_.]+)/g);

  return parts.map((part, index) => {
    // Check if this part is a mention (starts with @)
    if (part.startsWith("@")) {
      const username = part.slice(1); // Remove the @ symbol
      return (
        <ProfileHoverCard key={index} username={username}>
          <Link
            to={`/${username}`}
            className="text-black hover:underline font-medium"
            title={`View ${username}'s profile`}
          >
            {part}
          </Link>
        </ProfileHoverCard>
      );
    }

    // Regular text part
    return part;
  });
}

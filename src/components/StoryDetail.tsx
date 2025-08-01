import React, { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronUp,
  MessageSquare,
  Star,
  Linkedin,
  Twitter,
  Github,
  Flag,
  Bookmark,
  BookmarkCheck,
  Link2,
  Play,
  Edit3,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation } from "convex/react"; // Import Convex hooks
import { api } from "../../convex/_generated/api"; // Import Convex API
import type { Story, Comment as CommentType } from "../types";
import { Comment } from "./Comment";
import { CommentForm } from "./CommentForm";
import { Id, Doc } from "../../convex/_generated/dataModel"; // Import Id and Doc
import { useAuth, useUser } from "@clerk/clerk-react"; // Added useAuth, useUser
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"; // Assuming you have a Dialog component
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button"; // For modal buttons
import { toast } from "sonner";
import { AuthRequiredDialog } from "./ui/AuthRequiredDialog";

// Removed MOCK_COMMENTS

interface StoryDetailProps {
  story: Story; // Expecting story with resolved tags (including colors and isHidden)
}

// Copied and adapted BookmarkButton from StoryList.tsx
const BookmarkButton = ({ storyId }: { storyId: Id<"stories"> }) => {
  const { isSignedIn, isLoaded: isClerkLoaded } = useAuth(); // Ensure useAuth is available
  const isBookmarked = useQuery(api.bookmarks.isStoryBookmarked, isSignedIn ? { storyId } : "skip");
  const addOrRemoveBookmarkMutation = useMutation(api.bookmarks.addOrRemoveBookmark);

  const handleBookmarkClick = async () => {
    if (!isClerkLoaded) return;
    if (!isSignedIn) {
      // Instead of alert, navigate or show a toast
      // navigate("/sign-in"); // Assuming navigate is available in this scope or passed as prop
      toast.error("Please sign in to bookmark stories.");
      return;
    }
    try {
      await addOrRemoveBookmarkMutation({ storyId });
      // Optionally, show a success toast
      // toast.success(isBookmarked ? "Bookmark removed" : "Story bookmarked!");
    } catch (error) {
      console.error("Failed to update bookmark:", error);
      toast.error("Failed to update bookmark. Please try again.");
    }
  };

  if (!isClerkLoaded) {
    // Show a loading state or disabled button
    return (
      <button
        className="flex items-center gap-1 text-[#787672] opacity-50 cursor-not-allowed"
        disabled
        title="Loading...">
        <Bookmark className="w-4 h-4" />
      </button>
    );
  }

  if (!isSignedIn) {
    return (
      <button
        className="flex items-center gap-1 text-[#787672] hover:text-[#525252]"
        onClick={() => {
          toast.info("Please sign in to bookmark stories.");
        }}
        title="Sign in to bookmark">
        <Bookmark className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={handleBookmarkClick}
      className="flex items-center gap-1 text-[#787672] hover:text-[#525252]"
      title={isBookmarked ? "Remove bookmark" : "Bookmark story"}>
      {isBookmarked ? (
        <BookmarkCheck className="w-4 h-4 text-black" />
      ) : (
        <Bookmark className="w-4 h-4" />
      )}
    </button>
  );
};

export function StoryDetail({ story }: StoryDetailProps) {
  const navigate = useNavigate(); // Initialize navigate
  const { isSignedIn, isLoaded: isClerkLoaded } = useAuth(); // Get auth state
  const { user } = useUser(); // Get current user data
  const [searchParams, setSearchParams] = useSearchParams();

  // Edit mode state
  const isEditMode = searchParams.get("edit") === "true";
  const [isEditing, setIsEditing] = React.useState(false);
  const [editFormData, setEditFormData] = React.useState({
    title: story.title,
    description: story.description,
    longDescription: story.longDescription || "",
    submitterName: story.submitterName || "",
    url: story.url,
    videoUrl: story.videoUrl || "",
    email: story.email || "",
  });
  const [editDynamicFormData, setEditDynamicFormData] = React.useState<Record<string, string>>({});
  const [selectedTagIds, setSelectedTagIds] = React.useState<Id<"tags">[]>(story.tagIds || []);
  const [newTagNames, setNewTagNames] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  // Screenshot management state
  const [currentScreenshot, setCurrentScreenshot] = React.useState<string | null>(
    story.screenshotUrl || null
  );
  const [newScreenshotFile, setNewScreenshotFile] = React.useState<File | null>(null);
  const [removeScreenshot, setRemoveScreenshot] = React.useState(false);
  const [screenshotPreview, setScreenshotPreview] = React.useState<string | null>(null);

  // Fetch APPROVED comments using Convex query
  const comments = useQuery(api.comments.listApprovedByStory, { storyId: story._id });
  const currentUserRating = useQuery(
    api.stories.getUserRatingForStory,
    isSignedIn ? { storyId: story._id } : "skip" // Only run if signed in
  );

  const [replyToId, setReplyToId] = React.useState<Id<"comments"> | null>(null);

  // Rating state - keep local state for UI feedback, but rely on Convex for source of truth
  const [hoveredRating, setHoveredRating] = React.useState<number>(0);

  const hasRated = currentUserRating !== null && currentUserRating !== undefined;

  // Convex mutations
  const voteStory = useMutation(api.stories.voteStory);
  const rateStory = useMutation(api.stories.rate);
  const addComment = useMutation(api.comments.add);
  const createReportMutation = useMutation(api.reports.createReport);
  const updateOwnStoryMutation = useMutation(api.stories.updateOwnStory);
  const generateUploadUrl = useMutation(api.stories.generateUploadUrl);

  // Additional queries for editing
  const availableTags = useQuery(api.tags.listHeader);

  const [isReportModalOpen, setIsReportModalOpen] = React.useState(false);
  const [reportReason, setReportReason] = React.useState("");
  const [isReporting, setIsReporting] = React.useState(false);
  const [reportModalError, setReportModalError] = React.useState<string | null>(null);

  // Auth required dialog state
  const [showAuthDialog, setShowAuthDialog] = React.useState(false);
  const [authDialogAction, setAuthDialogAction] = React.useState("");

  // Fetch related stories
  const relatedStories = useQuery(
    api.stories.getRelatedStoriesByTags,
    story.tags && story.tags.length > 0
      ? {
          currentStoryId: story._id,
          tagIds: story.tags.map((tag: Doc<"tags">) => tag._id),
          limit: 3, // Already limits to 3 max from backend
        }
      : "skip"
  );

  // Fetch enabled form fields for dynamic link display
  const enabledFormFields = useQuery(api.storyFormFields.listEnabled);

  // Get current user's Convex data to check ownership
  const currentUser = useQuery(api.users.getMyUserDocument, isSignedIn && user ? {} : "skip");

  // Handle edit mode initialization
  React.useEffect(() => {
    const canEdit = isClerkLoaded && isSignedIn && currentUser && story.userId === currentUser._id;
    if (isEditMode && canEdit) {
      setIsEditing(true);
      // Initialize form data with current story values
      setEditFormData({
        title: story.title,
        description: story.description,
        longDescription: story.longDescription || "",
        submitterName: story.submitterName || "",
        url: story.url,
        videoUrl: story.videoUrl || "",
        email: story.email || "",
      });

      // Initialize dynamic form data
      const dynamicData: Record<string, string> = {};
      if (story.linkedinUrl) dynamicData.linkedinUrl = story.linkedinUrl;
      if (story.twitterUrl) dynamicData.twitterUrl = story.twitterUrl;
      if (story.githubUrl) dynamicData.githubUrl = story.githubUrl;
      if (story.chefShowUrl) dynamicData.chefShowUrl = story.chefShowUrl;
      if (story.chefAppUrl) dynamicData.chefAppUrl = story.chefAppUrl;
      setEditDynamicFormData(dynamicData);

      setSelectedTagIds(story.tagIds || []);

      // Reset screenshot state
      setCurrentScreenshot(story.screenshotUrl || null);
      setNewScreenshotFile(null);
      setRemoveScreenshot(false);
      setScreenshotPreview(null);
    } else if (isEditMode && !canEdit) {
      // Remove edit parameter if user can't edit
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete("edit");
      setSearchParams(newSearchParams);
    }
  }, [isEditMode, isClerkLoaded, isSignedIn, currentUser, story, searchParams, setSearchParams]);

  const handleVote = () => {
    if (!isClerkLoaded) return; // Don't do anything if Clerk hasn't loaded

    if (!isSignedIn) {
      setAuthDialogAction("vote");
      setShowAuthDialog(true);
      return;
    }
    voteStory({ storyId: story._id })
      .then((result) => {
        console.log("Vote successful:", result);
        // Optionally, update UI based on result.action and result.newVoteCount
      })
      .catch((error) => {
        console.error("Error voting:", error);
        // Handle error, e.g., show a notification to the user
      });
  };

  const handleRating = (value: number) => {
    if (!isClerkLoaded) return;

    if (!isSignedIn) {
      setAuthDialogAction("rate");
      setShowAuthDialog(true);
      return;
    }
    if (hasRated) {
      // User has already rated, prevent re-rating (or allow update if implemented)
      alert("You have already rated this app.");
      return;
    }
    rateStory({ storyId: story._id, rating: value })
      .then((result) => {
        console.log("Rating success:", result);
        // Optimistically update UI or refetch currentUserRating might be needed here
        // For now, a simple alert.
      })
      .catch((error) => {
        console.error("Error rating:", error);
        alert(`Error rating: ${error.data?.message || error.message}`);
      });
  };

  const handleCommentSubmit = (content: string) => {
    if (!isClerkLoaded) return;
    if (!isSignedIn) {
      setAuthDialogAction("comment");
      setShowAuthDialog(true);
      return;
    }
    addComment({
      storyId: story._id,
      content,
      parentId: replyToId || undefined,
    });
    setReplyToId(null);
  };

  const handleOpenReportModal = () => {
    setReportModalError(null);
    setReportReason("");
    setIsReportModalOpen(true);
  };

  const handleReportModalOpenChange = (open: boolean): void => {
    setIsReportModalOpen(open);
    if (!open) {
      setReportModalError(null);
    }
  };

  const handleReportSubmit = async () => {
    if (!reportReason.trim()) {
      setReportModalError("Please provide a reason for reporting.");
      return;
    }
    if (!story?._id) {
      setReportModalError("Story ID is missing, cannot submit report.");
      return;
    }

    setIsReporting(true);
    setReportModalError(null);
    try {
      await createReportMutation({ storyId: story._id, reason: reportReason });
      toast.success("Story reported successfully. An admin will review it.");
      setIsReportModalOpen(false);
      setReportReason("");
    } catch (error: any) {
      console.error("Error reporting story:", error); // Keep full log for debugging

      // Attempt to extract the most user-friendly message from the Convex error
      let userFriendlyMessage = "You have already reported this story, and it is pending review."; // Default fallback
      if (error.data) {
        if (typeof error.data === "string") {
          userFriendlyMessage = error.data; // If error.data is the string itself
        } else if (error.data.message && typeof error.data.message === "string") {
          userFriendlyMessage = error.data.message; // Standard Convex error message path
        } else if (
          error.message &&
          typeof error.message === "string" &&
          error.message.includes("Uncaught Error:")
        ) {
          // Fallback to parsing the longer error.message if a specific known phrase is present
          // This is more brittle but can catch the desired message if not in error.data.message
          const match = error.message.match(/Uncaught Error: (.*?) at handler/);
          if (match && match[1]) {
            userFriendlyMessage = match[1];
          }
        }
      }
      setReportModalError(userFriendlyMessage);
    }
    setIsReporting(false);
  };

  // Edit form handlers
  const handleEditCancel = () => {
    setIsEditing(false);
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.delete("edit");
    setSearchParams(newSearchParams);
    setEditError(null);

    // Reset screenshot state and cleanup preview URL
    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
    }
    setCurrentScreenshot(story.screenshotUrl || null);
    setNewScreenshotFile(null);
    setRemoveScreenshot(false);
    setScreenshotPreview(null);
  };

  const toggleTag = (tagId: Id<"tags">) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // Screenshot handling functions
  const handleScreenshotFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewScreenshotFile(file);
      setRemoveScreenshot(false);

      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setScreenshotPreview(previewUrl);
    }
  };

  const handleRemoveScreenshot = () => {
    setRemoveScreenshot(true);
    setNewScreenshotFile(null);
    setScreenshotPreview(null);

    // Clear file input
    const fileInput = document.getElementById("edit-screenshot") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const handleKeepCurrentScreenshot = () => {
    setRemoveScreenshot(false);
    setNewScreenshotFile(null);
    setScreenshotPreview(null);

    // Clear file input
    const fileInput = document.getElementById("edit-screenshot") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  // Cleanup preview URL on component unmount or when preview changes
  React.useEffect(() => {
    return () => {
      if (screenshotPreview) {
        URL.revokeObjectURL(screenshotPreview);
      }
    };
  }, [screenshotPreview]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || story.userId !== currentUser._id) return;

    const totalTagsSelected = selectedTagIds.length + newTagNames.length;
    if (totalTagsSelected === 0) {
      setEditError("Please select at least one tag.");
      return;
    }

    setIsSubmitting(true);
    setEditError(null);

    try {
      let screenshotStorageId: Id<"_storage"> | undefined = undefined;

      // Handle screenshot upload if a new file is selected
      if (newScreenshotFile) {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": newScreenshotFile.type },
          body: newScreenshotFile,
        });
        const { storageId } = await result.json();
        if (!storageId) {
          throw new Error("Failed to get storage ID after upload.");
        }
        screenshotStorageId = storageId;
      } else if (removeScreenshot) {
        // If user wants to remove screenshot, pass undefined
        screenshotStorageId = undefined;
      } else {
        // Keep current screenshot by not passing screenshotId parameter
        // (the mutation will only update fields that are provided)
      }

      const result = await updateOwnStoryMutation({
        storyId: story._id,
        title: editFormData.title,
        description: editFormData.description,
        longDescription: editFormData.longDescription || undefined,
        submitterName: editFormData.submitterName || undefined,
        url: editFormData.url,
        videoUrl: editFormData.videoUrl || undefined,
        email: editFormData.email || undefined,
        tagIds: selectedTagIds,
        newTagNames: newTagNames,
        linkedinUrl: editDynamicFormData.linkedinUrl || undefined,
        twitterUrl: editDynamicFormData.twitterUrl || undefined,
        githubUrl: editDynamicFormData.githubUrl || undefined,
        chefShowUrl: editDynamicFormData.chefShowUrl || undefined,
        chefAppUrl: editDynamicFormData.chefAppUrl || undefined,
        ...(newScreenshotFile || removeScreenshot ? { screenshotId: screenshotStorageId } : {}),
      });

      toast.success("Submission updated successfully!");

      // Navigate to updated story if slug changed
      if (result.slug && result.slug !== story.slug) {
        navigate(`/s/${result.slug}`, { replace: true });
      } else {
        // Just exit edit mode
        handleEditCancel();
        // Force refresh by reloading the page
        window.location.reload();
      }
    } catch (error: any) {
      console.error("Failed to update story:", error);
      setEditError(error.data?.message || error.message || "Failed to update submission.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update document title and meta description
  useEffect(() => {
    document.title = `${story.title} | Vibe Coding`;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", story.description);
    } else {
      // Create meta tag if it doesn't exist
      const newMeta = document.createElement("meta");
      newMeta.name = "description";
      newMeta.content = story.description;
      document.head.appendChild(newMeta);
    }

    // Update og:image meta tag
    const ogImage = document.querySelector('meta[property="og:image"]');
    const imageUrl = story.screenshotUrl || "/vibe-apps-open-graphi-image.png";
    if (ogImage) {
      ogImage.setAttribute("content", imageUrl);
    } else {
      // Create og:image meta tag if it doesn't exist
      const newOgImage = document.createElement("meta");
      newOgImage.setAttribute("property", "og:image");
      newOgImage.setAttribute("content", imageUrl);
      document.head.appendChild(newOgImage);
    }
  }, [story.title, story.description, story.screenshotUrl]);

  const averageRating = story.ratingCount > 0 ? story.ratingSum / story.ratingCount : 0;
  // The direct GitHub link is removed as per new requirement for modal
  // const reportUrl = `https://github.com/waynesutton/vibeapps/issues/new?q=is%3Aissue+state%3Aopen+Flagged&labels=flagged&title=Flagged+Content%3A+${encodeURIComponent(story.title)}&body=Reporting+issue+for+story%3A+%0A-+Title%3A+${encodeURIComponent(story.title)}%0A-+Slug%3A+${storySlug}%0A-+URL%3A+${encodeURIComponent(story.url)}%0A-+Reason%3A+`;

  return (
    <div className="max-w-7xl mx-auto pb-10">
      <Link to="/" className="text-[#545454] hover:text-[#525252] inline-block mb-6 text-sm">
        ← Back to Apps
      </Link>

      <div className="flex gap-8">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <article className="bg-white rounded-lg p-4 sm:p-6 border border-[#D8E1EC]">
            <div className="flex gap-4">
              <div className="flex flex-col items-center gap-1 pt-1 min-w-[40px]">
                <button
                  onClick={handleVote}
                  disabled={!isClerkLoaded} // Disable while Clerk is loading to prevent premature clicks
                  className={`text-[#292929] hover:bg-[#F4F0ED] p-1 rounded ${
                    !isSignedIn && isClerkLoaded ? "opacity-50 cursor-help" : ""
                  }`}
                  title={!isSignedIn && isClerkLoaded ? "Sign in to vote" : "Vote for this app"}>
                  <ChevronUp className="w-5 h-5" />
                </button>
                <span className="text-[#525252] font-medium text-sm">{story.votes}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold  text-transform: capitalize text-[#000000] mb-2">
                  <a
                    href={story.url}
                    className="hover:text-[#555555] break-words"
                    target="_blank"
                    rel="noopener noreferrer">
                    {story.title}
                  </a>
                </h1>
                {story.customMessage && (
                  <div className="mb-4 text-sm text-[#ffffff] bg-[#292929] border border-[#D8E1EC] rounded-md p-3 italic">
                    {story.customMessage}
                  </div>
                )}
                {story.screenshotUrl && (
                  <div className="mb-4 rounded-md overflow-hidden border border-[#F4F0ED]">
                    <img
                      src={story.screenshotUrl}
                      alt={`${story.title} screenshot`}
                      className="w-full max-h-[60vh] object-contain bg-gray-100"
                      loading="lazy"
                    />
                  </div>
                )}
                <p className="text-[#000000] mb-4 mt-[20px] prose prose-base max-w-none">
                  {story.description}
                </p>
                {story.longDescription && (
                  <div className="text-[#525252] mb-4 prose prose-base max-w-none whitespace-pre-line">
                    {story.longDescription}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-[#545454] flex-wrap mb-3">
                  {story.authorUsername ? (
                    <Link
                      to={`/${story.authorUsername}`}
                      className="hover:text-[#525252] hover:underline">
                      by {story.submitterName || story.authorName || story.authorUsername}
                    </Link>
                  ) : (
                    <span>by {story.submitterName || story.authorName || "Anonymous User"}</span>
                  )}
                  <span>{formatDistanceToNow(story._creationTime)} ago</span>
                  <Link to="#comments" className="flex items-center gap-1 hover:text-[#525252]">
                    <MessageSquare className="w-4 h-4" />
                    {comments?.length ?? 0} Comments
                  </Link>
                  <BookmarkButton storyId={story._id} />
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* Project Links & Tags Sidebar */}
        {(story.url ||
          story.videoUrl ||
          enabledFormFields?.some((field) => (story as any)[field.storyPropertyName]) ||
          story.tags?.length > 0) && (
          <div className="w-80 flex-shrink-0 hidden lg:block">
            <div className="bg-[#F9F9F9] rounded-lg p-4 border border-[#E5E5E5] sticky top-4">
              <h2 className="text-base font-medium text-[#525252] mb-3">Project Links & Tags</h2>
              <div className="space-y-2">
                {story.url && (
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-[#545454] flex-shrink-0" />
                    <a
                      href={story.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#525252] hover:text-[#292929] hover:underline truncate"
                      title={story.url}>
                      {story.url}
                    </a>
                  </div>
                )}

                {story.videoUrl && story.videoUrl.trim() && (
                  <div className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-[#545454] flex-shrink-0" />
                    <a
                      href={story.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#525252] hover:text-[#292929] hover:underline truncate"
                      title={story.videoUrl}>
                      Video Demo
                    </a>
                  </div>
                )}

                {/* Dynamic Form Fields */}
                {enabledFormFields?.map((field) => {
                  const fieldValue = (story as any)[field.storyPropertyName];
                  if (!fieldValue) return null;

                  // Get appropriate icon based on field key or type
                  const getIcon = () => {
                    if (field.key.toLowerCase().includes("github")) {
                      return <Github className="w-4 h-4 text-[#545454] flex-shrink-0" />;
                    } else if (field.key.toLowerCase().includes("linkedin")) {
                      return <Linkedin className="w-4 h-4 text-[#545454] flex-shrink-0" />;
                    } else if (
                      field.key.toLowerCase().includes("twitter") ||
                      field.key.toLowerCase().includes("x")
                    ) {
                      return <Twitter className="w-4 h-4 text-[#545454] flex-shrink-0" />;
                    } else if (field.key.toLowerCase().includes("chef")) {
                      return <span className="w-4 h-4 text-[#545454] flex-shrink-0">🍲</span>;
                    } else if (field.fieldType === "url") {
                      return <Link2 className="w-4 h-4 text-[#545454] flex-shrink-0" />;
                    } else if (field.fieldType === "email") {
                      return <span className="w-4 h-4 text-[#545454] flex-shrink-0">✉️</span>;
                    } else {
                      return <span className="w-4 h-4 text-[#545454] flex-shrink-0">🔗</span>;
                    }
                  };

                  // Get display label
                  const getDisplayLabel = () => {
                    // Remove "(Optional)" and other common suffixes for cleaner display
                    return field.label.replace(/\s*\(Optional\).*$/i, "").trim();
                  };

                  return (
                    <div key={field._id} className="flex items-center gap-2">
                      {getIcon()}
                      {field.fieldType === "url" ? (
                        <a
                          href={fieldValue}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#525252] hover:text-[#292929] hover:underline truncate"
                          title={fieldValue}>
                          {getDisplayLabel()}
                        </a>
                      ) : field.fieldType === "email" ? (
                        <a
                          href={`mailto:${fieldValue}`}
                          className="text-sm text-[#525252] hover:text-[#292929] hover:underline truncate"
                          title={fieldValue}>
                          {getDisplayLabel()}
                        </a>
                      ) : (
                        <span className="text-sm text-[#525252] truncate" title={fieldValue}>
                          {getDisplayLabel()}: {fieldValue}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Tags */}
                {story.tags && story.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap pt-2 border-t border-[#E5E5E5] mt-3">
                    {(story.tags || []).map(
                      (tag: Doc<"tags">) =>
                        !tag.isHidden &&
                        tag.name !== "resendhackathon" && (
                          <Link
                            key={tag._id}
                            to={`/tag/${tag.slug}`}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-opacity hover:opacity-80"
                            style={{
                              backgroundColor: tag.backgroundColor || "#F4F0ED",
                              color: tag.textColor || "#525252",
                              border: tag.backgroundColor ? "none" : `1px solid #D5D3D0`,
                            }}
                            title={`View all apps tagged with ${tag.name}`}>
                            {tag.emoji && <span className="mr-1">{tag.emoji}</span>}
                            {tag.iconUrl && !tag.emoji && (
                              <img
                                src={tag.iconUrl}
                                alt=""
                                className="w-3 h-3 mr-1 rounded-sm object-cover"
                              />
                            )}
                            {tag.name}
                          </Link>
                        )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Form Section */}
      {isEditing && currentUser && story.userId === currentUser._id && (
        <div className="mt-8 bg-white rounded-lg p-6 border border-[#D8E1EC]">
          <form onSubmit={handleEditSubmit} className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-medium text-[#525252]">Edit Submission</h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleEditCancel}
                  disabled={isSubmitting}
                  className="text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    isSubmitting ||
                    !editFormData.title ||
                    !editFormData.description ||
                    !editFormData.url
                  }
                  className="text-xs bg-[#292929] text-white hover:bg-[#525252]">
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>

            <div>
              <label htmlFor="edit-title" className="block text-sm font-medium text-[#525252] mb-1">
                App Title *
              </label>
              <input
                type="text"
                id="edit-title"
                placeholder="Site name"
                value={editFormData.title}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 bg-white rounded-md text-[#525252] focus:outline-none focus:ring-1 focus:ring-[#292929] border border-[#D8E1EC]"
                required
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label
                htmlFor="edit-description"
                className="block text-sm font-medium text-[#525252] mb-1">
                App/Project Tagline *
              </label>
              <input
                type="text"
                id="edit-description"
                placeholder="One sentence pitch or description"
                value={editFormData.description}
                onChange={(e) =>
                  setEditFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                className="w-full px-3 py-2 bg-white rounded-md text-[#525252] focus:outline-none focus:ring-1 focus:ring-[#292929] border border-[#D8E1EC]"
                required
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label
                htmlFor="edit-longDescription"
                className="block text-sm font-medium text-[#525252] mb-1">
                Description (Optional)
              </label>
              <textarea
                id="edit-longDescription"
                placeholder="- What it does&#10;- Key Features&#10;- How you built it"
                value={editFormData.longDescription}
                onChange={(e) =>
                  setEditFormData((prev) => ({ ...prev, longDescription: e.target.value }))
                }
                rows={4}
                className="w-full px-3 py-2 bg-white rounded-md text-[#525252] focus:outline-none focus:ring-1 focus:ring-[#292929] border border-[#D8E1EC]"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="edit-url" className="block text-sm font-medium text-[#525252] mb-1">
                App Website Link *
              </label>
              <input
                type="url"
                id="edit-url"
                placeholder="https://"
                value={editFormData.url}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, url: e.target.value }))}
                className="w-full px-3 py-2 bg-white rounded-md text-[#525252] focus:outline-none focus:ring-1 focus:ring-[#292929] border border-[#D8E1EC]"
                required
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label
                htmlFor="edit-videoUrl"
                className="block text-sm font-medium text-[#525252] mb-1">
                Video Demo (Optional)
              </label>
              <input
                type="url"
                id="edit-videoUrl"
                placeholder="https://youtube.com/..."
                value={editFormData.videoUrl}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, videoUrl: e.target.value }))}
                className="w-full px-3 py-2 bg-white rounded-md text-[#525252] focus:outline-none focus:ring-1 focus:ring-[#292929] border border-[#D8E1EC]"
                disabled={isSubmitting}
              />
            </div>

            {/* Screenshot Upload Section */}
            <div>
              <label className="block text-sm font-medium text-[#525252] mb-2">
                Screenshot (Optional)
              </label>

              {/* Current Screenshot Display */}
              {currentScreenshot && !removeScreenshot && !screenshotPreview && (
                <div className="mb-3">
                  <div className="text-sm text-[#545454] mb-2">Current screenshot:</div>
                  <div className="relative inline-block">
                    <img
                      src={currentScreenshot}
                      alt="Current screenshot"
                      className="max-w-xs max-h-32 rounded-md border border-[#D8E1EC] object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveScreenshot}
                      disabled={isSubmitting}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600 disabled:opacity-50"
                      title="Remove screenshot">
                      ×
                    </button>
                  </div>
                </div>
              )}

              {/* New Screenshot Preview */}
              {screenshotPreview && (
                <div className="mb-3">
                  <div className="text-sm text-[#545454] mb-2">New screenshot:</div>
                  <div className="relative inline-block">
                    <img
                      src={screenshotPreview}
                      alt="New screenshot preview"
                      className="max-w-xs max-h-32 rounded-md border border-[#D8E1EC] object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleKeepCurrentScreenshot}
                      disabled={isSubmitting}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600 disabled:opacity-50"
                      title="Cancel new screenshot">
                      ×
                    </button>
                  </div>
                </div>
              )}

              {/* Removed Screenshot Message */}
              {removeScreenshot && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-md">
                  <div className="text-sm text-red-700">
                    Screenshot will be removed when you save.
                  </div>
                  <button
                    type="button"
                    onClick={handleKeepCurrentScreenshot}
                    disabled={isSubmitting}
                    className="text-sm text-red-600 hover:text-red-800 underline mt-1">
                    Keep current screenshot
                  </button>
                </div>
              )}

              {/* File Upload Input */}
              <input
                type="file"
                id="edit-screenshot"
                accept="image/*"
                onChange={handleScreenshotFileChange}
                className="w-full px-3 py-2 bg-white rounded-md text-[#525252] focus:outline-none focus:ring-1 focus:ring-[#292929] border border-[#D8E1EC] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-[#F4F0ED] file:text-[#525252] hover:file:bg-[#e5e1de]"
                disabled={isSubmitting}
              />

              {newScreenshotFile && (
                <div className="text-sm text-[#545454] mt-1">
                  Selected: {newScreenshotFile.name}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-submitterName"
                className="block text-sm font-medium text-[#525252] mb-1">
                Your Name *
              </label>
              <input
                type="text"
                id="edit-submitterName"
                placeholder="Your name"
                value={editFormData.submitterName}
                onChange={(e) =>
                  setEditFormData((prev) => ({ ...prev, submitterName: e.target.value }))
                }
                className="w-full px-3 py-2 bg-white rounded-md text-[#525252] focus:outline-none focus:ring-1 focus:ring-[#292929] border border-[#D8E1EC]"
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Dynamic Form Fields */}
            {enabledFormFields?.map((field) => (
              <div key={field.key}>
                <label
                  htmlFor={`edit-${field.key}`}
                  className="block text-sm font-medium text-[#525252] mb-1">
                  {field.label}
                </label>
                {field.description && (
                  <div className="text-sm text-[#545454] mb-2">{field.description}</div>
                )}
                <input
                  type={field.fieldType}
                  id={`edit-${field.key}`}
                  placeholder={field.placeholder}
                  value={editDynamicFormData[field.key] || ""}
                  onChange={(e) =>
                    setEditDynamicFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-white rounded-md text-[#525252] focus:outline-none focus:ring-1 focus:ring-[#292929] border border-[#D8E1EC]"
                  required={field.isRequired}
                  disabled={isSubmitting}
                />
              </div>
            ))}

            {/* Tags Selection */}
            <div>
              <label className="block text-sm font-medium text-[#525252] mb-2">Select Tags *</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {availableTags === undefined && (
                  <span className="text-sm text-gray-500">Loading tags...</span>
                )}
                {availableTags?.map((tag) => (
                  <button
                    key={tag._id}
                    type="button"
                    onClick={() => toggleTag(tag._id)}
                    disabled={isSubmitting}
                    className={`px-3 py-1 rounded-md text-sm transition-colors border ${
                      selectedTagIds.includes(tag._id)
                        ? "bg-[#F4F0ED] text-[#292929] border-[#D5D3D0]"
                        : "bg-white text-[#545454] border-[#D5D3D0] hover:border-[#A8A29E] hover:text-[#525252]"
                    }`}>
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>

            {editError && (
              <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{editError}</div>
            )}
          </form>
        </div>
      )}

      {/* Rating Section */}
      {!isEditing && (
        <div className="mt-8 bg-white rounded-lg p-6 border border-[#D8E1EC]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
            <h2 className="text-lg font-medium text-[#525252]">
              {hasRated ? "Your Rating" : "Rate this app"}
            </h2>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  onClick={() => handleRating(value)}
                  onMouseEnter={() => !hasRated && setHoveredRating(value)} // Only hover if not rated
                  onMouseLeave={() => setHoveredRating(0)}
                  disabled={!isClerkLoaded || (isSignedIn && hasRated)} // Disable if not loaded, or if signed in AND already rated
                  className={`p-1 transition-colors disabled:cursor-not-allowed ${
                    !isSignedIn && isClerkLoaded ? "opacity-50 cursor-help" : ""
                  } ${
                    hasRated
                      ? value <= (currentUserRating || 0)
                        ? "text-yellow-500"
                        : "text-gray-300"
                      : value <= (hoveredRating || 0)
                        ? "text-yellow-400"
                        : "text-gray-300 hover:text-yellow-400"
                  }`}
                  title={
                    !isSignedIn && isClerkLoaded
                      ? "Sign in to rate"
                      : hasRated
                        ? `You rated ${currentUserRating} star(s)`
                        : `Rate ${value} stars`
                  }>
                  <Star className="w-5 h-5 fill-current" />
                </button>
              ))}
            </div>
            {story.ratingCount > 0 && (
              <span className="text-sm text-[#545454]">
                {averageRating.toFixed(1)} stars ({story.ratingCount}
                {story.ratingCount === 1 ? " rating" : " ratings"})
              </span>
            )}
          </div>
          <p className="text-sm text-[#545454]">Your rating helps others discover great apps.</p>
        </div>
      )}

      {/* Comments Section */}
      {!isEditing && (
        <div id="comments" className="mt-8 scroll-mt-20">
          <h2 className="text-xl font-medium text-[#525252] mb-4">
            {comments?.length ?? 0} {(comments?.length ?? 0) === 1 ? "Comment" : "Comments"}
          </h2>
          <CommentForm onSubmit={handleCommentSubmit} />
          <div className="mt-8 space-y-6 border-t border-[#F4F0ED] pt-6">
            {comments === undefined && <div>Loading comments...</div>}
            {comments?.map((commentData) => {
              // Rename variable to avoid conflict
              // Ensure commentData conforms to CommentType, though validation should happen in backend
              const comment = commentData as CommentType;
              return (
                <React.Fragment key={comment._id}>
                  <Comment comment={comment} onReply={(parentId) => setReplyToId(parentId)} />
                  {replyToId === comment._id && (
                    <div className="pl-8 pt-4">
                      <CommentForm onSubmit={handleCommentSubmit} parentId={comment._id} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {comments && comments.length === 0 && (
              <div className="text-[#545454]">No comments yet. Be the first!</div>
            )}
          </div>
        </div>
      )}

      {/* Related Apps Section */}
      {!isEditing && relatedStories && relatedStories.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-medium text-[#525252] mb-6">Related Apps</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {relatedStories.map((relatedStory: Story) => (
              <div
                key={relatedStory._id}
                className="bg-white rounded-lg p-4 border border-[#D8E1EC] flex flex-col group">
                {relatedStory.screenshotUrl && (
                  <Link
                    to={`/s/${relatedStory.slug}`}
                    className="mb-3 block overflow-hidden rounded-md aspect-video">
                    <img
                      src={relatedStory.screenshotUrl}
                      alt={`${relatedStory.title} screenshot`}
                      className="w-full h-full object-cover bg-gray-100 group-hover:scale-105 transition-transform duration-300 ease-in-out"
                      loading="lazy"
                    />
                  </Link>
                )}
                <h3 className="text-lg font-semibold text-[#292929] mb-1 truncate">
                  <Link
                    to={`/s/${relatedStory.slug}`}
                    className="hover:text-[#555555] hover:underline">
                    {relatedStory.title}
                  </Link>
                </h3>
                {relatedStory.description && (
                  <p className="text-sm text-[#545454] mb-2 line-clamp-2 flex-grow">
                    {relatedStory.description}
                  </p>
                )}
                <p
                  className={`text-xs text-[#545454] mb-2 ${relatedStory.description ? "" : "flex-grow"}`}>
                  By {relatedStory.authorName || relatedStory.authorUsername || "Anonymous"}
                </p>
                <div className="flex items-center text-xs text-[#545454] gap-3 mt-auto pt-2 border-t border-[#F4F0ED]">
                  <span>{relatedStory.votes} vibes</span>
                  {/* <span>{relatedStory.commentCount ?? 0} comments</span> */}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Submission Section */}
      {!isEditing &&
        isClerkLoaded &&
        isSignedIn &&
        currentUser &&
        story.userId === currentUser._id && (
          <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between text-sm text-blue-600">
            <div className="flex items-center gap-3">
              <Edit3 className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span className="font-medium text-blue-700">Want to update your submission?</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-blue-200 text-blue-600 hover:bg-blue-100"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("edit", "true");
                window.location.href = url.toString();
              }}>
              Edit Submission
            </Button>
          </div>
        )}

      {/* Flag/Report Section */}
      {!isEditing && (
        <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-3">
            <Flag className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="font-medium text-gray-700">Seen something inappropriate?</span>
          </div>
          {isClerkLoaded && isSignedIn ? (
            <Button variant="outline" size="sm" className="text-xs" onClick={handleOpenReportModal}>
              Report this Submission
            </Button>
          ) : isClerkLoaded && !isSignedIn ? (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => navigate("/sign-in")}
              title="Sign in to report content">
              Sign in to Report
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="text-xs" disabled>
              Loading...
            </Button>
          )}
        </div>
      )}

      {/* Report Modal */}
      <Dialog open={isReportModalOpen} onOpenChange={handleReportModalOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Report: {story.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p className="text-sm text-gray-500">
              Please provide a reason for reporting this submission. Your report will be reviewed by
              an administrator.
            </p>
            <Textarea
              placeholder="Reason for reporting..."
              value={reportReason}
              onChange={(e) => {
                setReportReason(e.target.value);
                if (reportModalError && e.target.value.trim()) {
                  setReportModalError(null);
                }
              }}
              rows={4}
              disabled={isReporting}
            />
          </div>
          {reportModalError && (
            <div className="mb-3 p-2 text-sm text-red-700 bg-red-100 border border-red-300 rounded-md">
              {reportModalError}
            </div>
          )}
          <DialogFooter className="sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsReportModalOpen(false);
                setReportModalError(null);
              }}
              disabled={isReporting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleReportSubmit}
              disabled={isReporting || !reportReason.trim()}
              className="bg-[#292929] text-white hover:bg-[#525252] disabled:opacity-50 sm:ml-[10px]"
              style={{ fontWeight: "normal" }}>
              {isReporting ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auth Required Dialog */}
      <AuthRequiredDialog
        isOpen={showAuthDialog}
        onClose={() => setShowAuthDialog(false)}
        action={authDialogAction}
      />
    </div>
  );
}

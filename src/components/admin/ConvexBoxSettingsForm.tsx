import React, { useState, useEffect, ChangeEvent } from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner"; // Assuming you use sonner for toasts

export function ConvexBoxSettingsForm() {
  const { isLoading: authIsLoading, isAuthenticated } = useConvexAuth();

  const currentSettings = useQuery(api.convexBoxConfig.get);
  const updateSettings = useMutation(api.convexBoxConfig.update);
  const generateUploadUrl = useMutation(api.convexBoxConfig.generateUploadUrl);

  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [displayText, setDisplayText] = useState<string>("");
  const [linkUrl, setLinkUrl] = useState<string>("");
  const [textAboveLogo, setTextAboveLogo] = useState<boolean>(true);
  const [boxSize, setBoxSize] = useState<"standard" | "square">("standard");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (currentSettings) {
      setIsEnabled(currentSettings.isEnabled);
      setDisplayText(currentSettings.displayText);
      setLinkUrl(currentSettings.linkUrl);
      setTextAboveLogo(currentSettings.textAboveLogo ?? true);
      setBoxSize(currentSettings.boxSize ?? "standard");
      setCurrentLogoUrl(currentSettings.logoUrl);
    }
  }, [currentSettings]);

  // Cleanup object URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (selectedFileUrl) {
        URL.revokeObjectURL(selectedFileUrl);
      }
    };
  }, [selectedFileUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);
      // Create a preview URL for the selected file
      const fileUrl = URL.createObjectURL(file);
      setSelectedFileUrl(fileUrl);
    } else {
      setSelectedFile(null);
      setSelectedFileUrl(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    let logoStorageId: Id<"_storage"> | undefined | null = currentSettings?.logoStorageId;

    try {
      if (selectedFile) {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": selectedFile.type },
          body: selectedFile,
        });
        const { storageId } = await result.json();
        logoStorageId = storageId;
        toast.success("Logo uploaded successfully!");
      }

      await updateSettings({
        isEnabled,
        displayText,
        linkUrl,
        textAboveLogo,
        boxSize,
        logoStorageId: logoStorageId, // Pass the new or existing ID
      });
      toast.success("ConvexBox settings updated!");
      setSelectedFile(null); // Clear file input after successful upload & save
      setSelectedFileUrl(null); // Clear preview URL
      // The useQuery for currentSettings will re-fetch and update the logo preview via useEffect
    } catch (error) {
      console.error("Failed to update ConvexBox settings:", error);
      toast.error("Failed to update settings. Check console for details.");
    }
    setIsSubmitting(false);
  };

  const handleRemoveLogo = async () => {
    setIsSubmitting(true);
    try {
      await updateSettings({
        logoStorageId: null, // Signal to remove/unset the logo
      });
      toast.success("Logo removed successfully!");
      setCurrentLogoUrl(null);
      setSelectedFile(null);
      setSelectedFileUrl(null);
    } catch (error) {
      console.error("Failed to remove logo:", error);
      toast.error("Failed to remove logo. Check console for details.");
    }
    setIsSubmitting(false);
  };

  if (authIsLoading) {
    return (
      <div className="space-y-6 bg-white p-6 rounded-lg shadow border text-center">
        Loading authentication...
      </div>
    );
  }

  if (currentSettings === undefined) {
    return <div>Loading settings...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow border">
      <h3 className="text-lg font-medium text-gray-800 mb-4">Popup Box Configuration</h3>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="isEnabled"
          checked={isEnabled}
          onCheckedChange={(checked) => setIsEnabled(Boolean(checked))}
        />
        <Label htmlFor="isEnabled" className="text-sm font-medium text-gray-700">
          Show Popup Box
        </Label>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="textAboveLogo"
          checked={textAboveLogo}
          onCheckedChange={(checked) => setTextAboveLogo(Boolean(checked))}
        />
        <Label htmlFor="textAboveLogo" className="text-sm font-medium text-gray-700">
          Display Text Above Logo
        </Label>
      </div>

      <div>
        <Label htmlFor="boxSize" className="block text-sm font-medium text-gray-700 mb-1">
          Box Size
        </Label>
        <Select value={boxSize} onValueChange={(value: "standard" | "square") => setBoxSize(value)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select box size" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard (350px × 150px)</SelectItem>
            <SelectItem value="square">Square (350px × 350px)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="displayText" className="block text-sm font-medium text-gray-700 mb-1">
          Display Text
        </Label>
        <Input
          id="displayText"
          type="text"
          value={displayText}
          onChange={(e) => setDisplayText(e.target.value)}
          className="w-full"
          required
        />
      </div>

      <div>
        <Label htmlFor="linkUrl" className="block text-sm font-medium text-gray-700 mb-1">
          Link URL
        </Label>
        <Input
          id="linkUrl"
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          className="w-full"
          placeholder="https://example.com"
          required
        />
      </div>

      <div>
        <Label htmlFor="logoFile" className="block text-sm font-medium text-gray-700 mb-1">
          Upload Logo (Optional)
        </Label>
        <Input
          id="logoFile"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="w-full text-sm"
        />
        {currentLogoUrl && !selectedFile && (
          <div className="mt-2">
            <p className="text-xs text-gray-600 mb-1">Current logo:</p>
            {linkUrl && linkUrl.trim() !== "" ? (
              <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                <img src={currentLogoUrl} alt="Current logo" className="max-h-20 border rounded" />
              </a>
            ) : (
              <img
                src={currentLogoUrl}
                alt="Current logo"
                className="max-h-20 border rounded inline-block"
              />
            )}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-red-600 px-0"
              onClick={handleRemoveLogo}
              disabled={isSubmitting}>
              Remove logo
            </Button>
          </div>
        )}
        {selectedFile && selectedFileUrl && (
          <div className="mt-2">
            <p className="text-xs text-gray-600 mb-1">New logo preview:</p>
            {linkUrl && linkUrl.trim() !== "" ? (
              <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                <img
                  src={selectedFileUrl}
                  alt="New logo preview"
                  className="max-h-20 border rounded"
                />
              </a>
            ) : (
              <img
                src={selectedFileUrl}
                alt="New logo preview"
                className="max-h-20 border rounded inline-block"
              />
            )}
            <p className="text-xs text-gray-600 mt-1">File: {selectedFile.name}</p>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Recommended: Small, transparent background PNG.
        </p>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-blue-600 hover:bg-blue-700 text-white">
        {isSubmitting ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}

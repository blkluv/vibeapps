import React, { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Link, useSearchParams } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { TagManagement } from "./TagManagement";
import { ContentModeration } from "./ContentModeration";
import { Settings } from "./Settings";
import { Forms } from "./Forms";
import { ReportManagement } from "./ReportManagement";
import { NumbersView } from "./NumbersView";
import { UserModeration } from "./UserModeration";
import { FormFieldManagement } from "./FormFieldManagement";
// FormResults is typically viewed via a specific form, not as a main tab.
// Consider removing it from the main tabs if it doesn't show an overview.

// Define the possible tabs
type AdminTab = "content" | "tags" | "form-fields" | "forms" | "reports" | "numbers" | "users" | "settings";

export function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as AdminTab) || "content";
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

  const { isLoading: authIsLoading, isAuthenticated } = useConvexAuth();

  const handleTabChange = (value: string) => {
    const newTab = value as AdminTab;
    setActiveTab(newTab);
    setSearchParams({ tab: newTab }, { replace: true }); // Update URL query param
  };

  if (authIsLoading) {
    return <div className="max-w-6xl mx-auto px-4 py-8 text-center">Loading authentication...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        Please log in to access the admin dashboard.
        {/* Optionally, add a <SignInButton /> here if you have Clerk components readily available */}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link to="/" className="text-sm text-[#545454] hover:text-[#525252] inline-block mb-6">
        ← Back to Apps Home
      </Link>

      <h1 className="text-2xl font-medium text-[#292929] mb-8">Admin Dashboard</h1>

      <Tabs.Root value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <Tabs.List className="flex flex-wrap gap-1 sm:gap-4 border-b border-gray-200">
          {(
            [
              { value: "content", label: "Moderation" },
              { value: "tags", label: "Tags" },
              { value: "form-fields", label: "Form Fields" },
              { value: "forms", label: "Forms" },
              { value: "reports", label: "Reports" },
              { value: "numbers", label: "Numbers" },
              { value: "users", label: "User Moderation" },
              { value: "settings", label: "Settings" },
            ] as { value: AdminTab; label: string }[]
          ).map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 data-[state=active]:text-[#292929] data-[state=active]:border-b-2 data-[state=active]:border-[#292929] focus:outline-none focus:z-10 whitespace-nowrap">
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="content" className="focus:outline-none">
          <ContentModeration />
        </Tabs.Content>

        <Tabs.Content value="tags" className="focus:outline-none">
          <TagManagement />
        </Tabs.Content>

        <Tabs.Content value="form-fields" className="focus:outline-none">
          <FormFieldManagement />
        </Tabs.Content>

        <Tabs.Content value="forms" className="focus:outline-none">
          <Forms />
        </Tabs.Content>

        <Tabs.Content value="reports" className="focus:outline-none">
          <ReportManagement />
        </Tabs.Content>

        <Tabs.Content value="numbers" className="focus:outline-none">
          <NumbersView />
        </Tabs.Content>

        <Tabs.Content value="users" className="focus:outline-none">
          <UserModeration />
        </Tabs.Content>

        <Tabs.Content value="settings" className="focus:outline-none">
          <Settings />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

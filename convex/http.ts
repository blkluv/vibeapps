import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { resend } from "./sendEmails";

const http = httpRouter();

// Define a route for Clerk webhooks
// The path can be anything you choose, e.g., "/clerk-webhooks" or "/api/clerk"
// Make sure this path matches what you configure in the Clerk dashboard
http.route({
  path: "/clerk", // You can change this path
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Get the signature and payload from the request
    const signature = request.headers.get("svix-signature");
    const id = request.headers.get("svix-id");
    const timestamp = request.headers.get("svix-timestamp");

    if (!signature || !id || !timestamp) {
      return new Response("Webhook Error: Missing svix headers", {
        status: 400,
      });
    }

    const payloadString = await request.text(); // Read the raw body as text

    // Call an internal action to handle the webhook, passing headers and the raw payload
    // We pass the raw payload string because svix needs it for verification
    try {
      await ctx.runAction(internal.clerk.handleClerkWebhook, {
        headers: {
          svix_id: id,
          svix_timestamp: timestamp,
          svix_signature: signature,
        },
        payload: payloadString,
      });
      return new Response(null, { status: 200 });
    } catch (err: any) {
      console.error("Error processing Clerk webhook:", err.message);
      // It's good practice to return a 200 even on internal errors
      // to prevent Clerk from resending the webhook unnecessarily,
      // unless the error is due to a malformed request that Clerk should know about.
      // For signature verification errors, svix might throw, which will be caught here.
      // Depending on the error from svix, you might return a 400.
      if (err.message.includes("Webhook Error:")) {
        // Specific errors from our action
        return new Response(err.message, { status: 400 });
      }
      return new Response("Webhook processing failed", { status: 500 }); // Or 200 to ack receipt
    }
  }),
});

// HTML generation function for story metadata
function generateStoryHTML(story: {
  title: string;
  description: string;
  screenshotUrl: string | null;
  slug: string;
  url: string;
  authorName?: string;
}) {
  const imageUrl =
    story.screenshotUrl ||
    "https://vibeapps.dev/vibe-apps-open-graphi-image.png";
  const canonicalUrl = `https://vibeapps.dev/s/${story.slug}`;
  const siteName = "Vibe Apps";
  const twitterHandle = "@waynesutton";

  // Escape HTML characters in dynamic content
  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const safeTitle = escapeHtml(story.title);
  const safeDescription = escapeHtml(story.description);
  const safeAuthorName = story.authorName ? escapeHtml(story.authorName) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Basic SEO -->
  <title>${safeTitle} | ${siteName}</title>
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${canonicalUrl}">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${safeTitle} | ${siteName}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${siteName}">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="${twitterHandle}">
  <meta name="twitter:creator" content="${twitterHandle}">
  <meta name="twitter:title" content="${safeTitle} | ${siteName}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${imageUrl}">
  
  <!-- Redirect to actual app after a brief delay for crawlers -->
  <script>
    setTimeout(() => {
      window.location.href = "${canonicalUrl}";
    }, 100);
  </script>
</head>
<body>
  <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
    <h1>${safeTitle}</h1>
    <p>${safeDescription}</p>
    ${safeAuthorName ? `<p>By ${safeAuthorName}</p>` : ""}
    <p><a href="${story.url}" target="_blank" rel="noopener noreferrer">Visit App →</a></p>
    <p><small>Redirecting to full page...</small></p>
  </div>
</body>
</html>`;
}

// Route for serving story metadata for social media crawlers
http.route({
  path: "/meta/s",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);

    // Prefer explicit query param, fall back to last path segment
    let slug = url.searchParams.get("slug");
    if (!slug) {
      const parts = url.pathname.split("/");
      slug = parts[parts.length - 1] || "";
    }

    if (!slug) {
      return new Response("Missing slug parameter", { status: 400 });
    }

    try {
      const story = await ctx.runQuery(internal.stories.getStoryMetadata, {
        slug,
      });

      if (!story) {
        return new Response("Story not found", { status: 404 });
      }

      const html = generateStoryHTML(story);
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // Cache for browsers and CDNs while allowing quick refreshes
          "Cache-Control":
            "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        },
      });
    } catch (error) {
      console.error("Error generating story metadata:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }),
});

// Export router at bottom after routes are defined
// New routes for robots.txt and llms.txt
http.route({
  path: "/robots.txt",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const body = await ctx.runQuery(internal.siteFiles.getFile, {
      key: "robots.txt",
    });
    return new Response(body ?? "User-agent: *\nAllow: /\n", {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=600",
      },
    });
  }),
});

// Resend webhook handler for email events (updates emailLogs via V8 mutation)
http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const payload = await req.json();
    try {
      const { type, data } = payload ?? {};
      if (type && data?.message_id) {
        const normalized = type.split(".")[1];
        if (
          normalized === "delivered" ||
          normalized === "bounced" ||
          normalized === "complained"
        ) {
          await ctx.runMutation(internal.emails.queries.updateEmailLogStatus, {
            resendMessageId: data.message_id,
            status: normalized,
            metadata: data,
          });
        }
      }
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("Resend webhook error", e);
      return new Response("error", { status: 200 }); // ack to avoid retries
    }
  }),
});

http.route({
  path: "/llms.txt",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const body = await ctx.runQuery(internal.siteFiles.getFile, {
      key: "llms.txt",
    });
    return new Response(body ?? "User-agent: *\nAllow: /\n", {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=600",
      },
    });
  }),
});

// Unsubscribe endpoint for email links
http.route({
  path: "/api/unsubscribe",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Invalid Unsubscribe Link</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #d32f2f; }
            </style>
          </head>
          <body>
            <h1 class="error">Invalid Unsubscribe Link</h1>
            <p>The unsubscribe link is missing required information. Please contact support if you continue to receive unwanted emails.</p>
            <a href="https://vibeapps.dev">Return to VibeApps</a>
          </body>
        </html>
      `,
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    try {
      const result = await ctx.runMutation(
        internal.emails.unsubscribe.handleUnsubscribeToken,
        {
          token,
        },
      );

      if (result.success) {
        return new Response(
          `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Successfully Unsubscribed</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                .success { color: #2e7d32; }
                .button { display: inline-block; background: #292929; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <h1 class="success">Successfully Unsubscribed</h1>
              <p>You have been unsubscribed from VibeApps emails. You will no longer receive email notifications.</p>
              <p>You can manage your email preferences anytime from your profile page.</p>
              <a href="https://vibeapps.dev" class="button">Return to VibeApps</a>
            </body>
          </html>
        `,
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          },
        );
      } else {
        return new Response(
          `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Unsubscribe Link Expired</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                .warning { color: #f57c00; }
                .button { display: inline-block; background: #292929; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <h1 class="warning">Unsubscribe Link Expired</h1>
              <p>This unsubscribe link has expired or has already been used. You can manage your email preferences from your profile page.</p>
              <a href="https://vibeapps.dev" class="button">Go to VibeApps</a>
            </body>
          </html>
        `,
          {
            status: 400,
            headers: { "Content-Type": "text/html" },
          },
        );
      }
    } catch (error) {
      console.error("Unsubscribe error:", error);
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Unsubscribe Error</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #d32f2f; }
            </style>
          </head>
          <body>
            <h1 class="error">Unsubscribe Error</h1>
            <p>There was an error processing your unsubscribe request. Please contact support.</p>
            <a href="https://vibeapps.dev">Return to VibeApps</a>
          </body>
        </html>
      `,
        {
          status: 500,
          headers: { "Content-Type": "text/html" },
        },
      );
    }
  }),
});

export default http;

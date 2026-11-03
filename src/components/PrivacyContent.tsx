/** Plain-language privacy notice, used on /privacy and in Settings. */
export function PrivacyContent() {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <p>
        <strong>Your food information belongs to you.</strong> Only your account can read or change your products and
        reminders. This is enforced by database security rules, not just by the app.
      </p>
      <p>
        <strong>What we store:</strong> your name and email (for your account), the food items you add (name, category,
        dates, quantity, location, notes), your reminder settings, and a push subscription for each device where you turn
        on notifications.
      </p>
      <p>
        <strong>Photos:</strong> when you scan a pack and the AI reader is set up, the photo is sent securely to the AI service
        (Groq, xAI or Google Gemini) only to read the dates, and is not kept by this app. Without it, or offline, the
        photo is read on your own device with open-source OCR.
        A small photo is saved only if you tick &ldquo;Save a small photo&rdquo; when adding a product.
      </p>
      <p>
        <strong>Deleting data:</strong> you can delete any product at any time, or delete all your products and
        notifications from Settings.
      </p>
      <p>
        <strong>No tracking:</strong> we do not use advertising, analytics trackers, or sell data, and we do not ask for
        any personal information beyond what is listed above.
      </p>
    </div>
  );
}

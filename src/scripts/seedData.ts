/**
 * Shared, valid program copy for every demo course (₹5 demo, 6+6 live, no gateway yet).
 * Paragraphs are separated by blank lines for the website UI.
 */
export function buildDetailDescription(trackSpecific: string): string {
  return [
    [
      "DEMO BOOKING — ₹5 (FIVE RUPEES)",
      "This is a demo course listing. The price is exactly five rupees (₹5) for the demo booking only. Anyone who creates an account can open this page and book. The booking is stored in our database so we know you want to join.",
    ].join("\n"),

    [
      "PAYMENT GATEWAY (NOT ACTIVE YET)",
      "We are not connecting a payment gateway at this stage. When you click Book, no card or UPI charge runs—the ₹5 is saved as a demo reservation in MongoDB. Later you can add Razorpay or another provider to collect the full program fee. Until then, this flow is only for testing and wait-lists.",
    ].join("\n"),

    [
      "FULL PROGRAM — 6 LIVE + 6 LIVE CLASSES (12 SESSIONS TOTAL)",
      "The complete program has two blocks:",
      "• Block A — 6 live sessions: foundation skills, routines, and getting comfortable with the mentor and the group.",
      "• Block B — 6 live sessions: deeper practice, small projects, and confidence-building before the next level.",
      "Each session is a scheduled, instructor-led class (video). Batches stay small so children can participate. Parents stay nearby for younger ages as needed.",
    ].join("\n"),

    ["WHAT THIS TRACK COVERS", trackSpecific].join("\n"),

    [
      "AFTER YOU BOOK",
      "Your booking appears on the Dashboard with course name, ₹5 demo amount, and a reference id. Join links and batch timings will be shared when you build messaging—or manually for now. The database row is the source of truth.",
    ].join("\n"),
  ].join("\n\n");
}

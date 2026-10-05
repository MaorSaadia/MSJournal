"use client";
import { Button } from "@/components/ui/button";
export default function PrivateError({ reset }: { reset: () => void }) {
  return (
    <div className="coming-page">
      <section className="coming-card">
        <h1>Workspace unavailable</h1>
        <p>
          Check the database connection and applied migrations, then try again.
          No private data is shown.
        </p>
        <Button onClick={reset}>Try again</Button>
      </section>
    </div>
  );
}

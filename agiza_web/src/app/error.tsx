"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/states";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container className="py-14">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        text="We couldn't load this page. Please try again in a moment."
        action={
          <div className="flex gap-2">
            <Button icon={<RefreshCw className="size-4" />} onClick={reset}>
              Try again
            </Button>
            <ButtonLink href="/" variant="secondary">
              Home
            </ButtonLink>
          </div>
        }
      />
    </Container>
  );
}

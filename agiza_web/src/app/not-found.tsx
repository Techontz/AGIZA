import { SearchX } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <Container className="py-14">
      <EmptyState
        icon={SearchX}
        title="We couldn't find that page"
        text="The product or store may no longer be available. Try searching, or browse the shop."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/shop">Browse the shop</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Home
            </ButtonLink>
          </div>
        }
      />
    </Container>
  );
}

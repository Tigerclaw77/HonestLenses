import { NextResponse } from "next/server";

import { isContactCondition } from "@/lib/seo/contactSeoRoutes";

type Context = {
  params: Promise<{ condition: string }>;
};

const CONDITION_DESTINATIONS = {
  astigmatism: "/contacts/toric-contact-lenses",
  presbyopia: "/contacts/multifocal-contact-lenses",
} as const;

export async function GET(request: Request, { params }: Context) {
  const { condition } = await params;

  if (!isContactCondition(condition)) {
    return new Response("Not found", { status: 404 });
  }

  return NextResponse.redirect(
    new URL(CONDITION_DESTINATIONS[condition], request.url),
    308,
  );
}

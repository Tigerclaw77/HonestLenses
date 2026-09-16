import { NextResponse } from "next/server";

import { lenses } from "@/LensCore/data/lenses";
import {
  findLensBySlug,
  getLensSlug,
} from "@/lib/seo/contactSeoRoutes";

type Context = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const { slug } = await params;
  const lens = findLensBySlug(lenses, slug);

  if (!lens) {
    return new Response("Not found", { status: 404 });
  }

  return NextResponse.redirect(
    new URL(`/contacts/${getLensSlug(lens)}`, request.url),
    308,
  );
}

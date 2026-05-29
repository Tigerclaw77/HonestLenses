export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  await context.params;

  return new Response("This comparison page has been retired.", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

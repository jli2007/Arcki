import { NextRequest, NextResponse } from "next/server";

const GITHUB_REPO = "jli2007/delta";

export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    // OAuth not configured - redirect to repo so icon still works
    return NextResponse.redirect(`https://github.com/${GITHUB_REPO}`);
  }

  const baseUrl = request.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/auth/github/callback`;
  const scope = "public_repo"; // needed to star repos
  const state = "star-" + GITHUB_REPO;

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}

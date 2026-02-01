import { NextRequest, NextResponse } from "next/server";

const GITHUB_REPO = "jli2007/delta";
const REPO_URL = `https://github.com/${GITHUB_REPO}`;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    // User denied or cancelled - redirect to repo anyway
    return NextResponse.redirect(REPO_URL);
  }

  if (!code) {
    return NextResponse.redirect(REPO_URL);
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(REPO_URL);
  }

  const baseUrl = request.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/auth/github/callback`;

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    return NextResponse.redirect(REPO_URL);
  }

  // Star the repo
  const starRes = await fetch(
    `https://api.github.com/user/starred/${GITHUB_REPO}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  // 204 = already starred or newly starred; either way we're good
  if (starRes.status !== 204 && starRes.status !== 404) {
    // 404 can happen if repo doesn't exist; still redirect
  }

  return NextResponse.redirect(REPO_URL);
}

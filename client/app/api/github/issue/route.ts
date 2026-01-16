import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, body: issueBody, labels = ["bug"] } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return NextResponse.json(
        { error: "GitHub token not configured. Please set GITHUB_TOKEN in your environment." },
        { status: 500 }
      );
    }

    // GitHub API endpoint
    const repo = "jli2007/delta";
    const url = `https://api.github.com/repos/${repo}/issues`;

    const headers = {
      Authorization: `token ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Arcki-Bug-Reporter",
      "Content-Type": "application/json",
    };

    const payload = {
      title: title.trim(),
      body: issueBody?.trim() || "No additional details provided.",
      labels: labels,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (response.status === 201) {
      const issueData = await response.json();
      return NextResponse.json({
        success: true,
        issue_number: issueData.number,
        issue_url: issueData.html_url,
        message: "Bug report created successfully",
      });
    } else if (response.status === 401) {
      return NextResponse.json(
        { error: "GitHub authentication failed. Please check your GITHUB_TOKEN." },
        { status: 401 }
      );
    } else if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: `GitHub API permission denied: ${errorData.message || "Forbidden"}` },
        { status: 403 }
      );
    } else {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: `GitHub API error: ${errorData.message || "Unknown error"}` },
        { status: response.status }
      );
    }
  } catch (error) {
    console.error("Failed to create GitHub issue:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create GitHub issue" },
      { status: 500 }
    );
  }
}

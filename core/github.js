/**
 * github.js – aggregate repos from multiple GitHub accounts.
 *
 * Configure via .env:
 *   GITHUB_TOKENS=ghp_tokenA,ghp_tokenB,ghp_tokenC
 *
 * Each token maps to one GitHub account. The module fetches the
 * authenticated user profile + all accessible repos for every token
 * and returns a merged list keyed by account login.
 */

const https = require("https");

/**
 * Minimal HTTPS GET helper that returns parsed JSON.
 * @param {string} url
 * @param {Record<string,string>} extraHeaders
 * @returns {Promise<unknown>}
 */
function githubGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const reqOpts = {
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: "GET",
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ai-automation-system",
        "X-GitHub-Api-Version": "2022-11-28",
        ...extraHeaders,
      },
    };
    const req = https.request(reqOpts, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Fetch all pages of a paginated GitHub API endpoint.
 * @param {string} baseUrl
 * @param {Record<string,string>} authHeader
 * @returns {Promise<unknown[]>}
 */
async function fetchAllPages(baseUrl, authHeader) {
  let results = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const { status, data } = await githubGet(`${baseUrl}${sep}per_page=100&page=${page}`, authHeader);
    if (status !== 200 || !Array.isArray(data) || data.length === 0) break;
    results = results.concat(data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

/**
 * Fetch all repos + profile for a single GitHub token.
 * @param {string} token
 * @returns {Promise<{login:string, avatarUrl:string, name:string, repos:object[]}>}
 */
async function fetchAccount(token) {
  const auth = { Authorization: `Bearer ${token}` };

  // Get authenticated user
  const { status: uStatus, data: user } = await githubGet("https://api.github.com/user", auth);
  if (uStatus !== 200 || !user || !user.login) {
    throw new Error(`GitHub API returned ${uStatus} for /user`);
  }

  // Fetch repos visible to this token (own + org repos)
  const repos = await fetchAllPages("https://api.github.com/user/repos?type=all&sort=updated", auth);

  return {
    login: user.login,
    name: user.name || user.login,
    avatarUrl: user.avatar_url || "",
    publicRepos: user.public_repos || 0,
    privateRepos: user.total_private_repos || 0,
    repos: repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      description: r.description || "",
      url: r.html_url,
      language: r.language || null,
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      openIssues: r.open_issues_count || 0,
      isPrivate: r.private,
      isFork: r.fork,
      isArchived: r.archived,
      defaultBranch: r.default_branch,
      pushedAt: r.pushed_at,
      updatedAt: r.updated_at,
      topics: r.topics || [],
    })),
  };
}

/**
 * Aggregate repos from all configured GitHub accounts.
 * Tokens are read from GITHUB_TOKENS env var (comma-separated).
 * @returns {Promise<{accounts: object[], totalRepos: number, fetchedAt: string}>}
 */
async function getAllAccounts() {
  const raw = process.env.GITHUB_TOKENS || "";
  const tokens = raw.split(",").map((t) => t.trim()).filter(Boolean);

  if (tokens.length === 0) {
    return { accounts: [], totalRepos: 0, fetchedAt: new Date().toISOString(), configured: false };
  }

  const results = await Promise.allSettled(tokens.map(fetchAccount));

  const accounts = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      accounts.push(r.value);
    } else {
      accounts.push({ error: r.reason?.message ?? "Unknown error" });
    }
  }

  const totalRepos = accounts.reduce((sum, a) => sum + (a.repos?.length ?? 0), 0);

  return { accounts, totalRepos, fetchedAt: new Date().toISOString(), configured: true };
}

module.exports = { getAllAccounts };

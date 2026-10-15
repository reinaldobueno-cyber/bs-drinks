import type { Context } from "@netlify/functions";

/**
 * Lists Netlify Form submissions for the "propostas" form.
 * Auth: header X-Admin-Password must match env ADMIN_PASSWORD.
 * Requires env NETLIFY_AUTH_TOKEN (Personal Access Token with forms:read)
 * and optionally SITE_ID (falls back to context.site.id).
 */

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const adminPassword = Netlify.env.get("ADMIN_PASSWORD");
  if (!adminPassword) {
    return Response.json(
      { error: "ADMIN_PASSWORD not configured on the site" },
      { status: 500 }
    );
  }

  const provided = req.headers.get("x-admin-password") || "";
  if (provided !== adminPassword) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = Netlify.env.get("NETLIFY_AUTH_TOKEN");
  if (!token) {
    return Response.json(
      {
        error:
          "NETLIFY_AUTH_TOKEN not configured. Create a Personal Access Token in Netlify User settings and set it as site env var (scope: Functions).",
      },
      { status: 500 }
    );
  }

  const siteId = Netlify.env.get("SITE_ID") || context.site?.id;
  if (!siteId) {
    return Response.json({ error: "Site ID unavailable" }, { status: 500 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);

  try {
    // 1) Find form id for "propostas"
    const formsRes = await fetch(
      `https://api.netlify.com/api/v1/sites/${siteId}/forms`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!formsRes.ok) {
      const t = await formsRes.text();
      return Response.json(
        { error: "Failed to list forms", detail: t },
        { status: formsRes.status }
      );
    }
    const forms = (await formsRes.json()) as Array<{ id: string; name: string }>;
    const form = forms.find((f) => f.name === "propostas");
    if (!form) {
      return Response.json({
        submissions: [],
        message:
          "Formulário 'propostas' ainda não registrado. Envie um pedido de teste no site após o deploy.",
      });
    }

    // 2) List submissions
    const subRes = await fetch(
      `https://api.netlify.com/api/v1/forms/${form.id}/submissions?per_page=${limit}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!subRes.ok) {
      const t = await subRes.text();
      return Response.json(
        { error: "Failed to list submissions", detail: t },
        { status: subRes.status }
      );
    }
    const submissions = await subRes.json();
    return Response.json({ submissions });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
};

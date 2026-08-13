// API reference UI. Scalar is loaded from CDN rather than vendored: the docs
// page is not part of the product surface, and a pinned major keeps it stable.
export const dynamic = "force-static";

const HTML = `<!doctype html>
<html>
  <head>
    <title>Soundwatch API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1"></script>
    <script>
      Scalar.createApiReference('#app', { url: '/api/openapi.json' });
    </script>
  </body>
</html>`;

export async function GET() {
  return new Response(HTML, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

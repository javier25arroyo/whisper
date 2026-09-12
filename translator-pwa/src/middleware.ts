import { NextRequest, NextResponse } from "next/server";

/** Candado propio de la app: sustituye a la protección de cuenta de Vercel para
 * que cualquiera con la contraseña pueda entrar (sin necesitar una cuenta de
 * Vercel), y sigue funcionando en el plan Hobby sin pagar Password Protection. */
const COOKIE_NAME = "app_access";
const COOKIE_VALUE = "granted";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function passwordPage(error?: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Acceso</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#020617; color:#f1f5f9; font-family:system-ui,-apple-system,sans-serif; padding:24px; }
  form { width:100%; max-width:320px; }
  h1 { font-size:18px; margin:0 0 16px; }
  input { width:100%; box-sizing:border-box; padding:12px 14px; border-radius:12px; border:1px solid #334155; background:#0f172a; color:#fff; font-size:16px; margin-bottom:12px; }
  button { width:100%; padding:12px 14px; border-radius:12px; border:none; background:#7c3aed; color:#fff; font-size:15px; font-weight:600; }
  p.error { color:#fca5a5; font-size:13px; margin:-6px 0 12px; }
</style>
</head>
<body>
  <form method="POST">
    <h1>Traductor de Voz</h1>
    ${error ? `<p class="error">${error}</p>` : ""}
    <input type="password" name="password" placeholder="Contraseña" autofocus required />
    <button type="submit">Entrar</button>
  </form>
</body>
</html>`;
}

function unauthorized(error?: string): NextResponse {
  return new NextResponse(passwordPage(error), {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (req.cookies.get(COOKIE_NAME)?.value === COOKIE_VALUE) {
    return NextResponse.next();
  }

  const expected = process.env.ACCESS_PASSWORD;

  if (req.method === "POST") {
    // Peticiones que no son el formulario de contraseña (p. ej. multipart de
    // /api/translate sin cookie) no siempre son parseables como formData: un
    // fallo aquí debe bloquear igual, nunca reventar con 500.
    let submitted: FormDataEntryValue | null = null;
    try {
      submitted = (await req.formData()).get("password");
    } catch {
      submitted = null;
    }
    if (expected && typeof submitted === "string" && submitted === expected) {
      const res = NextResponse.redirect(new URL(req.nextUrl.pathname, req.nextUrl.origin));
      res.cookies.set(COOKIE_NAME, COOKIE_VALUE, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: MAX_AGE_SECONDS,
        path: "/",
      });
      return res;
    }
    return unauthorized("Contraseña incorrecta.");
  }

  return unauthorized();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json).*)"],
};

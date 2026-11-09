
export function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer"
      }
    }
  );
}

export function errorResponse(code, message, status) {
  return jsonResponse(
    {
      error: {
        code,
        message
      }
    },
    status
  );
}

import { dotOrigin, dotResource } from "@/lib/supervisor-lab/dot-auth";
export function GET() {
  return Response.json({
    resource: dotResource(),
    authorization_servers: [dotOrigin()],
    scopes_supported: ["starlim:consult"],
  });
}

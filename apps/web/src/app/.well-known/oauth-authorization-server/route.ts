import { dotOrigin } from "@/lib/supervisor-lab/dot-auth";
export function GET() {
  const origin = dotOrigin();
  return Response.json({
    issuer: origin,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: `${origin}/api/supervisor-lab/oauth/authorize`,
    token_endpoint: `${origin}/api/supervisor-lab/oauth/token`,
    registration_endpoint: `${origin}/api/supervisor-lab/oauth/register`,
    revocation_endpoint: `${origin}/api/supervisor-lab/oauth/revoke`,
    token_endpoint_auth_methods_supported: ["none"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["starlim:consult"],
  });
}

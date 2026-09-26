export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export async function refresh( refreshToken: string ): Promise<string> {

	const response = await fetch( "/auth/refresh", {
		"method": "POST",
		"body": JSON.stringify( { "refresh_token": refreshToken } )
	} );
	const body = await response.json() as { "access_token": string };
	return body.access_token;
}
